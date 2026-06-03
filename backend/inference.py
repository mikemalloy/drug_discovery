# backend/inference.py
"""
Lazy-loaded model singleton. Nothing loads at import time —
_load() is called on first use. This keeps test imports fast.
"""
import glob
import math
import torch

# Model hosted on HuggingFace Hub — pushed via scripts/push_to_hub.py
# Scaffold-split model (2026-06-03): honest, MoleculeNet-comparable eval.
# Mean test ROC-AUC 0.7764 (scaffold) vs 0.8122 (old random split, optimistic).
HF_REPO_ID = 'mike-malloy/chemberta-tox21-multitarget-scaffold-20260603_1643'
HF_REVISION = 'main'  # pin to a commit SHA for stricter reproducibility/governance
MODEL_DIR   = HF_REPO_ID  # used in /health response and as from_pretrained() arg
DEVICE    = 'cpu'  # App Runner has no GPU

TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]
TARGET_IDX = {name: i for i, name in enumerate(TARGET_NAMES)}
NUM_TARGETS = len(TARGET_NAMES)

# Per-target F1-maximizing thresholds tuned on the scaffold validation set
# (re-tuned 2026-06-03 for the scaffold model; range 0.60–0.90, no ceiling hits).
# These were tuned on UNCALIBRATED probabilities — see THRESHOLDS remap below.
THRESHOLDS_RAW = {
    'NR-AR': 0.90, 'NR-AR-LBD': 0.75, 'NR-AhR': 0.75,
    'NR-Aromatase': 0.75, 'NR-ER': 0.70, 'NR-ER-LBD': 0.75,
    'NR-PPAR-gamma': 0.80, 'SR-ARE': 0.60, 'SR-ATAD5': 0.80,
    'SR-HSE': 0.65, 'SR-MMP': 0.70, 'SR-p53': 0.70,
}

# Per-endpoint temperature scaling (confidence calibration).
# Fit on the scaffold VALIDATION logits with the model FROZEN, minimizing BCE
# (calibration_temperatures.json, 2026-06-03). Temperature scaling is a monotonic
# transform, so ROC-AUC is provably unchanged (verified: AUC_before == AUC_after on
# every endpoint). Mean test ECE 0.214 -> 0.192. T<1 = model was underconfident.
# Displayed probabilities use p = sigmoid(logit / T) so they reflect empirical
# frequency rather than the model's raw (timid) scores.
TEMPERATURES = {
    'NR-AR': 0.5686, 'NR-AR-LBD': 0.5471, 'NR-AhR': 0.8079,
    'NR-Aromatase': 1.1912, 'NR-ER': 0.6482, 'NR-ER-LBD': 0.7427,
    'NR-PPAR-gamma': 0.8126, 'SR-ARE': 0.9626, 'SR-ATAD5': 0.9857,
    'SR-HSE': 0.8242, 'SR-MMP': 1.0693, 'SR-p53': 1.0225,
}
_T_TENSOR = torch.tensor([TEMPERATURES[t] for t in TARGET_NAMES], dtype=torch.float32)


def _logit(p: float) -> float:
    return math.log(p / (1.0 - p))


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


# Calibrated-scale thresholds. Because temperature scaling is monotonic, remapping
# each raw threshold through the SAME transform — new = sigmoid(logit(raw) / T) —
# preserves the EXACT toxic/safe decision boundary while keeping the threshold on
# the same (calibrated) scale as the probabilities now shown to the user. Net effect:
# verdicts are byte-for-byte identical to the pre-calibration model; only the
# confidence numbers change. report.py / server.py consume THRESHOLDS unchanged.
THRESHOLDS = {
    t: round(_sigmoid(_logit(THRESHOLDS_RAW[t]) / TEMPERATURES[t]), 4)
    for t in TARGET_NAMES
}
SEVERITY_WEIGHTS = {
    'NR-AR': 1.0, 'NR-AR-LBD': 1.0, 'NR-AhR': 1.5,
    'NR-Aromatase': 1.0, 'NR-ER': 1.0, 'NR-ER-LBD': 1.0,
    'NR-PPAR-gamma': 1.0, 'SR-ARE': 1.0, 'SR-ATAD5': 1.0,
    'SR-HSE': 1.0, 'SR-MMP': 1.5, 'SR-p53': 1.5,
}

_tokenizer = None
_model     = None


def _load():
    global _tokenizer, _model
    if _model is not None:
        return
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    from peft import PeftModel

    BASE_MODEL_ID = 'DeepChem/ChemBERTa-77M-MTR'

    print(f"[inference] Loading from HF Hub: {MODEL_DIR} @ {HF_REVISION}...")
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, revision=HF_REVISION, trust_remote_code=True)

    # This model was saved with PEFT (modules_to_save=["classifier"]).
    # Plain AutoModelForSequenceClassification misses the classifier weights and falls
    # back to ChemBERTa's 199-label config, causing IndexError at inference time.
    # Correct approach: load base with explicit num_labels, then overlay PEFT adapters.
    base = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL_ID,
        num_labels=NUM_TARGETS,
        problem_type="multi_label_classification",
        ignore_mismatched_sizes=True,
        trust_remote_code=True,
    )
    _model = PeftModel.from_pretrained(base, MODEL_DIR, revision=HF_REVISION)
    _model.eval().to(DEVICE)
    print("[inference] Model ready.")


def get_model():
    _load()
    return _model


def get_tokenizer():
    _load()
    return _tokenizer


def predict_probs(smiles: str) -> list[float]:
    """Single SMILES → list of 12 sigmoid probabilities."""
    _load()
    enc = _tokenizer(smiles, return_tensors='pt', truncation=True, max_length=512)
    enc = {k: v.to(DEVICE) for k, v in enc.items()}
    with torch.no_grad():
        logits = _model(**enc).logits[0]
    # temperature-scale per endpoint before sigmoid → calibrated probabilities
    return torch.sigmoid(logits / _T_TENSOR.to(logits.device)).cpu().tolist()


def batch_predict_probs(smiles_list: list[str], batch_size: int = 32):
    """List of SMILES → (N, 12) numpy array of probabilities."""
    import numpy as np
    _load()
    all_probs = []
    for i in range(0, len(smiles_list), batch_size):
        batch = smiles_list[i:i + batch_size]
        enc = _tokenizer(batch, return_tensors='pt', truncation=True,
                         max_length=512, padding=True)
        enc = {k: v.to(DEVICE) for k, v in enc.items()}
        with torch.no_grad():
            logits = _model(**enc).logits
        # temperature-scale per endpoint before sigmoid → calibrated probabilities
        all_probs.append(torch.sigmoid(logits / _T_TENSOR.to(logits.device)).cpu().numpy())
    return np.vstack(all_probs)
