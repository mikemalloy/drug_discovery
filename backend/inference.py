# backend/inference.py
"""
Lazy-loaded model singleton. Nothing loads at import time —
_load() is called on first use. This keeps test imports fast.
"""
import glob
import torch

# Model hosted on HuggingFace Hub — pushed via scripts/push_to_hub.py
HF_REPO_ID = 'mike-malloy/chemberta-tox21-multitarget'
MODEL_DIR   = HF_REPO_ID  # used in /health response and as from_pretrained() arg
DEVICE    = 'cpu'  # App Runner has no GPU

TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]
TARGET_IDX = {name: i for i, name in enumerate(TARGET_NAMES)}
NUM_TARGETS = len(TARGET_NAMES)

THRESHOLDS = {
    'NR-AR': 0.95, 'NR-AR-LBD': 0.95, 'NR-AhR': 0.75,
    'NR-Aromatase': 0.85, 'NR-ER': 0.70, 'NR-ER-LBD': 0.85,
    'NR-PPAR-gamma': 0.85, 'SR-ARE': 0.65, 'SR-ATAD5': 0.80,
    'SR-HSE': 0.85, 'SR-MMP': 0.85, 'SR-p53': 0.85,
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
    print(f"[inference] Loading from HF Hub: {MODEL_DIR}...")
    _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    _model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
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
    return torch.sigmoid(logits).cpu().tolist()


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
        all_probs.append(torch.sigmoid(logits).cpu().numpy())
    return np.vstack(all_probs)
