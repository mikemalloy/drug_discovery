# Drug Discovery AI Platform — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade AI drug discovery platform: virtual screening + compound report notebooks, a FastAPI backend containerized for AWS App Runner, and Terraform-managed infrastructure.

**Architecture:** Research-first — complete M4 (virtual screening) and M1.5 (summary report) notebooks which define the data contract, then build a FastAPI backend using lazy model loading, containerize with Docker, and deploy to App Runner via Terraform. Each phase produces independently testable software.

**Tech Stack:** Python 3.12, PyTorch (CPU-only), ChemBERTa/HuggingFace Transformers, PEFT/LoRA, Captum, RDKit, FastAPI, Uvicorn, Docker, AWS App Runner, ECR, S3, Terraform ≥ 1.5, pytest, httpx

---

## File Map

```
Drug Discovery/
├── milestone4_virtual_screening.ipynb      # Phase 1 — new
├── milestone1_5_summary_report.ipynb       # Phase 2 — new
├── sample_report.json                      # Phase 2 output — API contract fixture
├── screening_results.csv                   # Phase 1 output
│
├── backend/
│   ├── server.py           # FastAPI app: routes, CORS, request/response models
│   ├── inference.py        # Lazy model singleton: predict_probs, batch_predict_probs
│   ├── chemistry.py        # RDKit helpers: ADMET, PAINS, SVG, Lipinski, Veber
│   ├── report.py           # generate_report() orchestrator — source of truth for API schema
│   ├── Dockerfile          # python:3.12-slim, CPU torch, model pre-downloaded from HF Hub
│   ├── requirements.txt
│   └── tests/
│       ├── conftest.py     # TestClient fixture, stub report, mock patches
│       ├── test_health.py
│       ├── test_analyze.py
│       └── test_screen.py
│
├── terraform/
│   ├── main.tf             # ECR, App Runner, S3, IAM
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── backend.tf
│
└── scripts/
    ├── build.py            # Docker build + ECR push
    ├── deploy.py           # terraform apply + S3 sync
    ├── destroy.py          # terraform destroy
    ├── test_api.sh         # smoke tests against live URL
    └── tests/
        └── test_build.py   # unit tests for build.py
```

---

## Phase 1: Milestone 4 — Virtual Screening Notebook

### Task 1: Data Loading and Library Validation

**Files:**
- Create: `milestone4_virtual_screening.ipynb`
- Creates (on run): `data/zinc_subset.csv`

- [ ] **Step 1: Create the notebook and setup cell**

Create `milestone4_virtual_screening.ipynb`. Add a markdown cell at the top:

```markdown
# Milestone 4: Virtual Screening Pipeline
Batch-score a ZINC compound library through the multi-target toxicity model.
Ranks candidates by composite risk score and filters by drug-likeness.
```

Add a setup code cell:

```python
import os, re, glob, warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
from rdkit import Chem
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
from IPython.display import display, HTML
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
warnings.filterwarnings('ignore')
print("Imports OK")
```

- [ ] **Step 2: Add model loading cell** (reuses M2/M3 checkpoint and constants)

```python
BASE_MODEL = 'DeepChem/ChemBERTa-77M-MTR'
checkpoints = sorted(glob.glob('chemberta-tox21-multitarget-*'))
MODEL_DIR = checkpoints[-1]
print(f"Checkpoint: {MODEL_DIR}")

NUM_TARGETS = 12
TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]
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
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
print(f"Device: {DEVICE}")

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
base = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL, num_labels=NUM_TARGETS,
    ignore_mismatched_sizes=True, attn_implementation='eager',
)
model = PeftModel.from_pretrained(base, MODEL_DIR).merge_and_unload()
model.eval().to(DEVICE)
print("Model ready.")
```

- [ ] **Step 3: Add data loading cell**

```python
ZINC_URL = (
    "https://raw.githubusercontent.com/aspuru-guzik-group/"
    "chemical_vae/master/models/zinc_properties/"
    "250k_rndm_zinc_drugs_clean_3.csv"
)
CACHE = "data/zinc_subset.csv"
N_SAMPLE = 5000

if os.path.exists(CACHE):
    df_raw = pd.read_csv(CACHE)
    print(f"Loaded {len(df_raw)} compounds from cache.")
else:
    os.makedirs("data", exist_ok=True)
    print("Downloading ZINC-250k...")
    df_full = pd.read_csv(ZINC_URL)
    df_raw = df_full.sample(N_SAMPLE, random_state=42).reset_index(drop=True)
    df_raw.to_csv(CACHE, index=False)
    print(f"Downloaded and cached {len(df_raw)} compounds.")

print(f"Columns: {list(df_raw.columns)}")
df_raw.head(3)
```

- [ ] **Step 4: Add validation cell**

```python
# === ASSERTION CELL ===
mols = [Chem.MolFromSmiles(s) for s in df_raw['smiles']]
valid_mask = [m is not None for m in mols]
valid_smiles = df_raw['smiles'][valid_mask].tolist()
valid_mols   = [m for m in mols if m is not None]

assert len(valid_smiles) >= 4500, f"Expected ≥4500 valid SMILES, got {len(valid_smiles)}"
print(f"✓ {len(valid_smiles)}/{len(df_raw)} valid SMILES ({len(df_raw)-len(valid_smiles)} dropped)")
```

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add milestone4_virtual_screening.ipynb
git commit -m "feat(M4): scaffold virtual screening notebook — data loading and model setup"
```

---

### Task 2: Batch Inference and Risk Scoring

**Files:**
- Modify: `milestone4_virtual_screening.ipynb`

- [ ] **Step 1: Add batch inference function cell**

```python
def batch_predict_probs(smiles_list, batch_size=64):
    """Run model inference in batches. Returns (N, 12) numpy array."""
    all_probs = []
    n = len(smiles_list)
    for i in range(0, n, batch_size):
        batch = smiles_list[i:i+batch_size]
        enc = tokenizer(
            batch, return_tensors='pt', truncation=True,
            max_length=512, padding=True,
        )
        enc = {k: v.to(DEVICE) for k, v in enc.items()}
        with torch.no_grad():
            logits = model(**enc).logits
        all_probs.append(torch.sigmoid(logits).cpu().numpy())
        if (i // batch_size) % 5 == 0:
            print(f"  {min(i+batch_size, n)}/{n} compounds scored...", end='\r')
    print(f"  {n}/{n} compounds scored.    ")
    return np.vstack(all_probs)

print("Running batch inference (this takes a few minutes on CPU/MPS)...")
probs_matrix = batch_predict_probs(valid_smiles)  # shape: (N, 12)
print(f"Done. Probabilities shape: {probs_matrix.shape}")
```

- [ ] **Step 2: Add risk scoring cell**

```python
WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
WEIGHT_SUM   = WEIGHT_ARRAY.sum()

def compute_risk_scores(probs_matrix):
    """Weighted composite score in [0, 1]. Lower = safer."""
    return (probs_matrix * WEIGHT_ARRAY).sum(axis=1) / WEIGHT_SUM

risk_scores = compute_risk_scores(probs_matrix)
print(f"Risk scores — min: {risk_scores.min():.3f}  mean: {risk_scores.mean():.3f}  max: {risk_scores.max():.3f}")
```

- [ ] **Step 3: Add validation cell**

```python
# === ASSERTION CELL ===
assert probs_matrix.shape == (len(valid_smiles), 12), \
    f"Expected ({len(valid_smiles)}, 12), got {probs_matrix.shape}"
assert not np.isnan(probs_matrix).any(), "NaN probabilities found"
assert (risk_scores >= 0).all() and (risk_scores <= 1).all(), \
    "Risk scores out of [0, 1]"
print("✓ Batch inference and risk scoring assertions passed")
```

- [ ] **Step 4: Commit**

```bash
git add milestone4_virtual_screening.ipynb
git commit -m "feat(M4): batch inference and composite risk scoring"
```

---

### Task 3: Drug-Likeness Filtering, PAINS, and Ranking

**Files:**
- Modify: `milestone4_virtual_screening.ipynb`

- [ ] **Step 1: Add filter functions cell**

```python
# Initialize PAINS catalog once
_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)

def lipinski_pass(mol):
    violations = (
        int(Descriptors.ExactMolWt(mol) > 500) +
        int(Descriptors.MolLogP(mol) > 5) +
        int(Descriptors.NumHDonors(mol) > 5) +
        int(Descriptors.NumHAcceptors(mol) > 10)
    )
    return violations <= 1

def veber_pass(mol):
    return Descriptors.TPSA(mol) <= 140 and Descriptors.NumRotatableBonds(mol) <= 10

def pains_flag(mol):
    return _pains_catalog.HasMatch(mol)
```

- [ ] **Step 2: Add results DataFrame assembly cell**

```python
results = pd.DataFrame({
    'smiles':       valid_smiles,
    'risk_score':   risk_scores.round(4),
    'lipinski_pass': [lipinski_pass(m) for m in valid_mols],
    'veber_pass':    [veber_pass(m)    for m in valid_mols],
    'pains_flag':    [pains_flag(m)    for m in valid_mols],
    **{t: probs_matrix[:, i].round(4) for i, t in enumerate(TARGET_NAMES)}
})

results_sorted = results.sort_values('risk_score').reset_index(drop=True)
shortlist = results_sorted.head(50)
print(f"Full results: {len(results_sorted)} compounds")
print(f"Top-50 shortlist risk range: {shortlist['risk_score'].min():.3f} – {shortlist['risk_score'].max():.3f}")
shortlist[['smiles', 'risk_score', 'lipinski_pass', 'veber_pass', 'pains_flag']].head(10)
```

- [ ] **Step 3: Add validation cell**

```python
# === ASSERTION CELL ===
expected_cols = {'smiles', 'risk_score', 'lipinski_pass', 'veber_pass', 'pains_flag'} | set(TARGET_NAMES)
assert expected_cols.issubset(results.columns), f"Missing columns: {expected_cols - set(results.columns)}"

# Spot-check: aspirin should be low risk (we can add it manually)
aspirin_probs = batch_predict_probs(['CC(=O)Oc1ccccc1C(=O)O'])
aspirin_risk  = compute_risk_scores(aspirin_probs)[0]
assert aspirin_risk < 0.3, f"Aspirin risk score unexpectedly high: {aspirin_risk:.3f}"

# No compound in shortlist should have all 12 targets > threshold
for _, row in shortlist.iterrows():
    toxic_count = sum(row[t] >= THRESHOLDS[t] for t in TARGET_NAMES)
    assert toxic_count < 12, "Shortlist contains a compound flagged on all 12 targets"

print("✓ Filtering and ranking assertions passed")
```

- [ ] **Step 4: Export CSV**

```python
results_sorted.to_csv('screening_results.csv', index=False)
print(f"Saved screening_results.csv ({len(results_sorted)} rows)")
```

- [ ] **Step 5: Commit**

```bash
git add milestone4_virtual_screening.ipynb screening_results.csv
git commit -m "feat(M4): drug-likeness filtering, PAINS, ranking, export"
```

---

### Task 4: Visualizations

**Files:**
- Modify: `milestone4_virtual_screening.ipynb`

- [ ] **Step 1: Add risk score histogram cell**

```python
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Risk score distribution
axes[0].hist(risk_scores, bins=50, color='steelblue', edgecolor='white', alpha=0.85)
axes[0].axvline(x=0.25, color='orange', linestyle='--', label='Moderate threshold')
axes[0].axvline(x=0.50, color='red',    linestyle='--', label='High threshold')
axes[0].set_xlabel('Composite Risk Score')
axes[0].set_ylabel('Count')
axes[0].set_title(f'Risk Score Distribution (n={len(risk_scores)})')
axes[0].legend()

# Per-target pass rate
pass_rates = [(probs_matrix[:, i] < THRESHOLDS[t]).mean() for i, t in enumerate(TARGET_NAMES)]
axes[1].barh(TARGET_NAMES, pass_rates, color='seagreen', alpha=0.85)
axes[1].set_xlabel('Fraction of Compounds Passing (below threshold)')
axes[1].set_title('Per-Target Pass Rate')
axes[1].set_xlim(0, 1)

plt.tight_layout()
plt.savefig('data/screening_summary.png', dpi=150, bbox_inches='tight')
plt.show()
print("Plot saved to data/screening_summary.png")
```

- [ ] **Step 2: Add 2D structure grid cell for top-10 compounds**

```python
from rdkit.Chem import Draw
from IPython.display import Image

top10_mols   = [Chem.MolFromSmiles(s) for s in shortlist['smiles'].head(10)]
top10_labels = [f"#{i+1}  risk={shortlist['risk_score'].iloc[i]:.3f}" for i in range(10)]

img = Draw.MolsToGridImage(
    top10_mols, molsPerRow=5, subImgSize=(300, 200),
    legends=top10_labels, returnPNG=True,
)
with open('data/top10_compounds.png', 'wb') as f:
    f.write(img)
display(Image(data=img))
print("Top-10 grid saved to data/top10_compounds.png")
```

- [ ] **Step 3: Commit**

```bash
git add milestone4_virtual_screening.ipynb data/
git commit -m "feat(M4): visualizations — risk histogram and top-10 structure grid"
```

---

## Phase 2: Milestone 1.5 — Summary Report Notebook

### Task 5: ADMET Property Functions

**Files:**
- Create: `milestone1_5_summary_report.ipynb`

- [ ] **Step 1: Create notebook and add setup cell**

Create `milestone1_5_summary_report.ipynb`. Add setup markdown then code:

```python
import os, re, glob, json, warnings
import numpy as np
import torch
import matplotlib.pyplot as plt
from IPython.display import SVG, HTML, display
from rdkit import Chem
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel
from captum.attr import LayerIntegratedGradients
warnings.filterwarnings('ignore')

# ── Constants (same as M2, M3, M4) ─────────────────────────────────────────
BASE_MODEL = 'DeepChem/ChemBERTa-77M-MTR'
checkpoints = sorted(glob.glob('chemberta-tox21-multitarget-*'))
MODEL_DIR = checkpoints[-1]
NUM_TARGETS = 12
TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]
TARGET_IDX = {name: i for i, name in enumerate(TARGET_NAMES)}
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
DEVICE = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
WEIGHT_SUM   = WEIGHT_ARRAY.sum()
print(f"Checkpoint: {MODEL_DIR}  Device: {DEVICE}")
```

- [ ] **Step 2: Add model loading cell**

```python
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
base = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL, num_labels=NUM_TARGETS,
    ignore_mismatched_sizes=True, attn_implementation='eager',
)
model = PeftModel.from_pretrained(base, MODEL_DIR).merge_and_unload()
model.eval().to(DEVICE)

def _forward_for_ig(input_ids, attention_mask, target_idx):
    out = model(input_ids=input_ids, attention_mask=attention_mask)
    return torch.sigmoid(out.logits[:, target_idx])

lig = LayerIntegratedGradients(_forward_for_ig, model.roberta.embeddings)
print("Model and IG ready.")
```

- [ ] **Step 3: Add ADMET functions cell**

```python
_ATOM_RE = re.compile(r'\[[^\]]+\]|Cl|Br|[BCNOPSFI]|[bcnops]')

_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)

def mol_to_svg(mol, width=360, height=260):
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().addStereoAnnotation = False
    drawer.DrawMolecule(mol)
    finish = getattr(drawer, 'FinishDrawing', None) or getattr(drawer, 'EndDrawing')
    finish()
    return drawer.GetDrawingText()

def compute_admet(mol):
    mw  = Descriptors.ExactMolWt(mol)
    logp = Descriptors.MolLogP(mol)
    hbd  = Descriptors.NumHDonors(mol)
    hba  = Descriptors.NumHAcceptors(mol)
    tpsa = Descriptors.TPSA(mol)
    rb   = Descriptors.NumRotatableBonds(mol)
    violations = int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)
    pains = [e.GetDescription() for e in _pains_catalog.GetMatches(mol)]
    return {
        "molecular_weight": round(mw, 2),
        "logp": round(logp, 2),
        "hbd": hbd, "hba": hba,
        "tpsa": round(tpsa, 2),
        "rotatable_bonds": rb,
        "lipinski_pass": violations <= 1,
        "veber_pass": tpsa <= 140 and rb <= 10,
        "pains_alerts": pains,
    }
```

- [ ] **Step 4: Add ADMET validation cell**

```python
# === ASSERTION CELL ===
# Aspirin: MW=180, logP=1.2, HBD=1, HBA=3 — should pass Lipinski and Veber
aspirin = Chem.MolFromSmiles('CC(=O)Oc1ccccc1C(=O)O')
admet_asp = compute_admet(aspirin)
assert admet_asp['lipinski_pass'], "Aspirin should pass Lipinski"
assert admet_asp['veber_pass'],    "Aspirin should pass Veber"
assert admet_asp['molecular_weight'] < 200, f"MW wrong: {admet_asp['molecular_weight']}"
assert admet_asp['pains_alerts'] == [], f"Aspirin should have no PAINS alerts"

# Cyclosporin A: MW~1202, should fail Lipinski
cyclosporin = Chem.MolFromSmiles(
    'CCC1C(=O)N(CC(=O)N(C(C(=O)NC(C(=O)N(C(C(=O)NC(C(=O)NC(C(=O)N(C(C(=O)N(C(C(=O)N(C(C(=O)N1C)CC(C)C)C)CC(C)C)C)C)CC(C)C)C)C(C)C)C)CC(C)C)C)C(C)C)C)C'
)
if cyclosporin:
    admet_cyc = compute_admet(cyclosporin)
    assert not admet_cyc['lipinski_pass'], "Cyclosporin should fail Lipinski (MW > 500)"

print("✓ ADMET assertions passed")
print(f"  Aspirin: MW={admet_asp['molecular_weight']}, logP={admet_asp['logp']}, "
      f"Lipinski={admet_asp['lipinski_pass']}, Veber={admet_asp['veber_pass']}")
```

- [ ] **Step 5: Commit**

```bash
git add milestone1_5_summary_report.ipynb
git commit -m "feat(M1.5): scaffold summary report notebook — ADMET functions with assertions"
```

---

### Task 6: generate_report() Function

**Files:**
- Modify: `milestone1_5_summary_report.ipynb`

- [ ] **Step 1: Add predict and explainability helpers cell**

```python
def predict_probs(smiles):
    """Single compound → list of 12 floats."""
    enc = tokenizer(smiles, return_tensors='pt', truncation=True, max_length=512)
    enc = {k: v.to(DEVICE) for k, v in enc.items()}
    with torch.no_grad():
        logits = model(**enc).logits[0]
    return torch.sigmoid(logits).cpu().tolist()

def compute_explainability(canonical, mol, probs):
    """Run IG for top-3 targets by probability. Returns per-target atom scores."""
    enc = tokenizer(canonical, return_tensors='pt', return_offsets_mapping=True,
                    truncation=True, max_length=512)
    input_ids = enc['input_ids'].to(DEVICE)
    attn_mask = enc['attention_mask'].to(DEVICE)
    offsets   = enc['offset_mapping'][0].tolist()
    baseline_ids = torch.full_like(input_ids, tokenizer.pad_token_id)

    positions = [(m.start(), m.end()) for m in _ATOM_RE.finditer(canonical)]
    a_map = {}
    for atom_idx, (a_start, _) in enumerate(positions):
        for tok_idx, (t_start, t_end) in enumerate(offsets):
            if t_start <= a_start < t_end:
                a_map[atom_idx] = tok_idx
                break

    top_target_indices = np.argsort(probs)[-3:][::-1]
    result = {}
    for idx in top_target_indices:
        target_name = TARGET_NAMES[idx]
        attrs, _ = lig.attribute(
            inputs=input_ids,
            baselines=baseline_ids,
            additional_forward_args=(attn_mask, int(idx)),
            n_steps=30,
            return_convergence_delta=True,
        )
        token_scores = attrs.sum(dim=-1).squeeze(0).detach().cpu().numpy()
        atom_scores = {
            i: float(token_scores[a_map[i]])
            if i in a_map and a_map[i] < len(token_scores) else 0.0
            for i in range(mol.GetNumAtoms())
        }
        sorted_atoms = sorted(atom_scores.items(), key=lambda x: x[1], reverse=True)
        top_atoms = [k for k, v in sorted_atoms[:5] if v > 0]
        result[target_name] = {
            "atom_scores": {str(k): round(v, 4) for k, v in atom_scores.items()},
            "top_atoms": top_atoms,
        }
    return result
```

- [ ] **Step 2: Add generate_report() cell**

```python
def generate_report(smiles: str, compound_name: str = "") -> dict:
    """
    Source of truth for the API response schema.
    Returns a structured compound safety profile.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Cannot parse SMILES: {smiles}")
    canonical = Chem.MolToSmiles(mol)
    mol_can   = Chem.MolFromSmiles(canonical)

    probs = predict_probs(canonical)

    toxicity = {
        name: {
            "probability": round(probs[i], 4),
            "label": "TOXIC" if probs[i] >= THRESHOLDS[name] else "safe",
            "threshold": THRESHOLDS[name],
        }
        for i, name in enumerate(TARGET_NAMES)
    }

    admet = compute_admet(mol_can)
    explainability = compute_explainability(canonical, mol_can, probs)

    risk_score = float(np.dot(probs, WEIGHT_ARRAY) / WEIGHT_SUM)
    tier = "High" if risk_score > 0.5 else "Moderate" if risk_score > 0.25 else "Low"
    toxic_targets = [name for name, t in toxicity.items() if t["label"] == "TOXIC"]

    return {
        "smiles": smiles,
        "canonical_smiles": canonical,
        "compound_name": compound_name,
        "structure_svg": mol_to_svg(mol_can),
        "toxicity": toxicity,
        "admet": admet,
        "explainability": explainability,
        "risk_summary": {
            "composite_score": round(risk_score, 4),
            "tier": tier,
            "toxic_targets": toxic_targets,
            "flagged_targets": admet["pains_alerts"],
        },
    }
```

- [ ] **Step 3: Add schema validation cell**

```python
# === ASSERTION CELL ===
test_report = generate_report('CC(=O)Oc1ccccc1C(=O)O', 'Aspirin')

REQUIRED_KEYS = {'smiles', 'canonical_smiles', 'compound_name', 'structure_svg',
                 'toxicity', 'admet', 'explainability', 'risk_summary'}
assert REQUIRED_KEYS == set(test_report.keys()), f"Missing keys: {REQUIRED_KEYS - set(test_report.keys())}"
assert len(test_report['toxicity']) == 12, "Expected 12 toxicity targets"
assert test_report['admet']['lipinski_pass'] == True, "Aspirin should pass Lipinski"
assert test_report['risk_summary']['tier'] in ('Low', 'Moderate', 'High'), "Invalid tier"
assert test_report['structure_svg'].startswith('<svg'), "SVG should start with <svg"
assert isinstance(test_report['risk_summary']['composite_score'], float)
assert 0 <= test_report['risk_summary']['composite_score'] <= 1

print(f"✓ generate_report() schema assertions passed")
print(f"  Aspirin: tier={test_report['risk_summary']['tier']}, "
      f"score={test_report['risk_summary']['composite_score']:.3f}, "
      f"toxic_targets={test_report['risk_summary']['toxic_targets']}")
```

- [ ] **Step 4: Commit**

```bash
git add milestone1_5_summary_report.ipynb
git commit -m "feat(M1.5): generate_report() with full schema and assertions"
```

---

### Task 7: Report Rendering and JSON Export

**Files:**
- Modify: `milestone1_5_summary_report.ipynb`
- Creates: `sample_report.json`

- [ ] **Step 1: Add HTML report renderer cell**

```python
def render_report_html(report):
    """Render a generate_report() dict as rich HTML."""
    r = report
    tier_color = {'Low': '#27ae60', 'Moderate': '#f39c12', 'High': '#e74c3c'}
    color = tier_color.get(r['risk_summary']['tier'], 'gray')

    toxicity_rows = "".join(
        f"<tr><td>{'⚠️ ' if t['label']=='TOXIC' else ''}{name}</td>"
        f"<td>{t['probability']:.3f}</td>"
        f"<td style='color:{'red' if t['label']==\"TOXIC\" else \"green\"}'>{t['label']}</td></tr>"
        for name, t in r['toxicity'].items()
    )
    admet = r['admet']
    admet_rows = (
        f"<tr><td>Molecular Weight</td><td>{admet['molecular_weight']} Da</td></tr>"
        f"<tr><td>LogP</td><td>{admet['logp']}</td></tr>"
        f"<tr><td>H-Bond Donors</td><td>{admet['hbd']}</td></tr>"
        f"<tr><td>H-Bond Acceptors</td><td>{admet['hba']}</td></tr>"
        f"<tr><td>TPSA</td><td>{admet['tpsa']} Å²</td></tr>"
        f"<tr><td>Rotatable Bonds</td><td>{admet['rotatable_bonds']}</td></tr>"
        f"<tr><td>Lipinski Ro5</td><td>{'✓ Pass' if admet['lipinski_pass'] else '✗ Fail'}</td></tr>"
        f"<tr><td>Veber Rules</td><td>{'✓ Pass' if admet['veber_pass'] else '✗ Fail'}</td></tr>"
        f"<tr><td>PAINS Alerts</td><td>{', '.join(admet['pains_alerts']) or 'None'}</td></tr>"
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:900px;border:1px solid #ddd;border-radius:8px;padding:16px">
      <h2>{r['compound_name'] or 'Compound'} — Safety Profile</h2>
      <p style="font-family:monospace;font-size:12px;color:#555">{r['canonical_smiles']}</p>
      <div style="display:flex;gap:24px;align-items:flex-start">
        <div>{r['structure_svg']}</div>
        <div>
          <div style="background:{color};color:white;padding:8px 16px;border-radius:6px;font-size:18px;font-weight:bold;margin-bottom:12px">
            Risk: {r['risk_summary']['tier']} ({r['risk_summary']['composite_score']:.3f})
          </div>
          <p>Toxic targets: {', '.join(r['risk_summary']['toxic_targets']) or 'None'}</p>
        </div>
      </div>
      <div style="display:flex;gap:24px;margin-top:16px">
        <div style="flex:1">
          <h3>Toxicity Predictions</h3>
          <table style="width:100%;border-collapse:collapse">
            <tr><th style="text-align:left">Target</th><th>Prob</th><th>Label</th></tr>
            {toxicity_rows}
          </table>
        </div>
        <div style="flex:1">
          <h3>ADMET Properties</h3>
          <table style="width:100%;border-collapse:collapse">
            {admet_rows}
          </table>
        </div>
      </div>
    </div>"""
    display(HTML(html))
```

- [ ] **Step 2: Add reference molecule reports cell**

```python
MOLECULES = {
    'Aspirin':      'CC(=O)Oc1ccccc1C(=O)O',
    'Tamoxifen':    'CCC(=C(c1ccccc1)c1ccc(OCCO)cc1)c1ccccc1',
    'Bisphenol A':  'CC(c1ccc(O)cc1)(c1ccc(O)cc1)',
    'Dioxin (TCDD)':'Clc1ccc2c(c1)Oc1cc(Cl)ccc1O2',
    'Caffeine':     'Cn1c(=O)c2c(ncn2C)n(C)c1=O',
}

reports = {}
for name, smiles in MOLECULES.items():
    print(f"\n{'='*50}")
    print(f"Generating report: {name}")
    reports[name] = generate_report(smiles, name)
    render_report_html(reports[name])
```

- [ ] **Step 3: Export sample_report.json**

```python
# Export Aspirin report as the API contract fixture
with open('sample_report.json', 'w') as f:
    json.dump(reports['Aspirin'], f, indent=2)
print("Saved sample_report.json — this is the API contract fixture for backend tests.")

# Verify it round-trips cleanly
with open('sample_report.json') as f:
    loaded = json.load(f)
assert loaded['smiles'] == reports['Aspirin']['smiles']
assert len(loaded['toxicity']) == 12
print("✓ sample_report.json round-trip verified")
```

- [ ] **Step 4: Commit**

```bash
git add milestone1_5_summary_report.ipynb sample_report.json
git commit -m "feat(M1.5): HTML report renderer, reference molecule reports, sample_report.json export"
```

---

## Phase 3: Backend — FastAPI + Uvicorn

### Task 8: Project Structure and chemistry.py

**Files:**
- Create: `backend/chemistry.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/requirements.txt`

- [ ] **Step 1: Create backend directory structure**

```bash
mkdir -p "/Volumes/Hub/dev/Drug Discovery/backend/tests"
touch "/Volumes/Hub/dev/Drug Discovery/backend/__init__.py"
touch "/Volumes/Hub/dev/Drug Discovery/backend/tests/__init__.py"
```

- [ ] **Step 2: Write the failing test for chemistry.py**

Create `backend/tests/test_chemistry.py`:

```python
# tests/test_chemistry.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from rdkit import Chem
import pytest

ASPIRIN_SMILES = 'CC(=O)Oc1ccccc1C(=O)O'
ASPIRIN_MOL    = Chem.MolFromSmiles(ASPIRIN_SMILES)


def test_compute_admet_returns_required_keys():
    from chemistry import compute_admet
    result = compute_admet(ASPIRIN_MOL)
    required = {'molecular_weight', 'logp', 'hbd', 'hba', 'tpsa',
                'rotatable_bonds', 'lipinski_pass', 'veber_pass', 'pains_alerts'}
    assert required == set(result.keys())


def test_aspirin_passes_lipinski():
    from chemistry import compute_admet
    assert compute_admet(ASPIRIN_MOL)['lipinski_pass'] is True


def test_aspirin_passes_veber():
    from chemistry import compute_admet
    assert compute_admet(ASPIRIN_MOL)['veber_pass'] is True


def test_aspirin_no_pains():
    from chemistry import compute_admet
    assert compute_admet(ASPIRIN_MOL)['pains_alerts'] == []


def test_lipinski_pass():
    from chemistry import lipinski_pass
    assert lipinski_pass(ASPIRIN_MOL) is True


def test_veber_pass():
    from chemistry import veber_pass
    assert veber_pass(ASPIRIN_MOL) is True


def test_get_pains_alerts_returns_list():
    from chemistry import get_pains_alerts
    alerts = get_pains_alerts(ASPIRIN_MOL)
    assert isinstance(alerts, list)


def test_mol_to_svg_returns_svg_string():
    from chemistry import mol_to_svg
    svg = mol_to_svg(ASPIRIN_MOL)
    assert isinstance(svg, str)
    assert '<svg' in svg
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_chemistry.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'chemistry'`

- [ ] **Step 4: Create backend/chemistry.py**

```python
# backend/chemistry.py
import numpy as np
from rdkit import Chem
from rdkit.Chem import Descriptors
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
import matplotlib
matplotlib.use('Agg')  # non-interactive backend for server
import matplotlib.pyplot as plt

# PAINS catalog — initialized once at import
_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)


def mol_to_svg(mol: Chem.Mol, width: int = 360, height: int = 260) -> str:
    """Return SVG string of 2D molecule structure."""
    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().addStereoAnnotation = False
    drawer.DrawMolecule(mol)
    finish = getattr(drawer, 'FinishDrawing', None) or getattr(drawer, 'EndDrawing')
    finish()
    return drawer.GetDrawingText()


def compute_admet(mol: Chem.Mol) -> dict:
    """Return ADMET property dict for a molecule."""
    mw   = Descriptors.ExactMolWt(mol)
    logp = Descriptors.MolLogP(mol)
    hbd  = Descriptors.NumHDonors(mol)
    hba  = Descriptors.NumHAcceptors(mol)
    tpsa = Descriptors.TPSA(mol)
    rb   = Descriptors.NumRotatableBonds(mol)
    violations = int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)
    return {
        "molecular_weight": round(mw, 2),
        "logp":             round(logp, 2),
        "hbd":              hbd,
        "hba":              hba,
        "tpsa":             round(tpsa, 2),
        "rotatable_bonds":  rb,
        "lipinski_pass":    violations <= 1,
        "veber_pass":       tpsa <= 140 and rb <= 10,
        "pains_alerts":     get_pains_alerts(mol),
    }


def get_pains_alerts(mol: Chem.Mol) -> list[str]:
    """Return list of PAINS alert descriptions for a molecule."""
    return [e.GetDescription() for e in _pains_catalog.GetMatches(mol)]


def lipinski_pass(mol: Chem.Mol) -> bool:
    mw, logp = Descriptors.ExactMolWt(mol), Descriptors.MolLogP(mol)
    hbd, hba  = Descriptors.NumHDonors(mol), Descriptors.NumHAcceptors(mol)
    return (int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)) <= 1


def veber_pass(mol: Chem.Mol) -> bool:
    return Descriptors.TPSA(mol) <= 140 and Descriptors.NumRotatableBonds(mol) <= 10
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_chemistry.py -v
```

Expected: `8 passed`

- [ ] **Step 6: Create requirements.txt**

```
# backend/requirements.txt
torch --index-url https://download.pytorch.org/whl/cpu
transformers>=4.44.0
peft>=0.12.0
rdkit>=2024.3.5
captum>=0.7.0
fastapi>=0.115.0
uvicorn>=0.30.0
numpy>=1.26.0
matplotlib>=3.9.0
scipy>=1.13.0
httpx>=0.27.0
pytest>=8.0.0
```

- [ ] **Step 7: Create conftest.py**

```python
# backend/tests/conftest.py
import pytest
import json
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O'

TARGET_NAMES = [
    'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
    'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
    'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
]

STUB_REPORT = {
    "smiles": ASPIRIN,
    "canonical_smiles": ASPIRIN,
    "compound_name": "Aspirin",
    "structure_svg": "<svg width='360' height='260'><text>stub</text></svg>",
    "toxicity": {
        t: {"probability": 0.1, "label": "safe", "threshold": 0.85}
        for t in TARGET_NAMES
    },
    "admet": {
        "molecular_weight": 180.16, "logp": 1.19, "hbd": 1, "hba": 3,
        "tpsa": 63.6, "rotatable_bonds": 3,
        "lipinski_pass": True, "veber_pass": True, "pains_alerts": [],
    },
    "explainability": {
        TARGET_NAMES[0]: {"atom_scores": {"0": 0.1}, "top_atoms": [0]}
    },
    "risk_summary": {
        "composite_score": 0.1, "tier": "Low",
        "toxic_targets": [], "flagged_targets": [],
    },
}
```

- [ ] **Step 8: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add backend/
git commit -m "feat(backend): chemistry.py with full test coverage"
```

---

### Task 9: inference.py

**Files:**
- Create: `backend/inference.py`
- Create: `backend/tests/test_inference.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_inference.py`:

```python
# tests/test_inference.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
import numpy as np
from unittest.mock import patch, MagicMock


def test_target_names_has_12_entries():
    from inference import TARGET_NAMES
    assert len(TARGET_NAMES) == 12


def test_thresholds_covers_all_targets():
    from inference import TARGET_NAMES, THRESHOLDS
    assert set(THRESHOLDS.keys()) == set(TARGET_NAMES)


def test_severity_weights_covers_all_targets():
    from inference import TARGET_NAMES, SEVERITY_WEIGHTS
    assert set(SEVERITY_WEIGHTS.keys()) == set(TARGET_NAMES)


def test_predict_probs_returns_12_floats():
    """predict_probs returns exactly 12 float probabilities in [0,1]."""
    mock_model = MagicMock()
    mock_logits = __import__('torch').zeros(1, 12)
    mock_model.return_value.logits = mock_logits

    mock_tok = MagicMock()
    mock_tok.return_value = {
        'input_ids':      __import__('torch').zeros(1, 5, dtype=__import__('torch').long),
        'attention_mask': __import__('torch').ones(1, 5, dtype=__import__('torch').long),
    }

    import inference
    original_model = inference._model
    original_tok   = inference._tokenizer
    inference._model     = mock_model
    inference._tokenizer = mock_tok

    result = inference.predict_probs('CC(=O)Oc1ccccc1C(=O)O')

    inference._model     = original_model
    inference._tokenizer = original_tok

    assert len(result) == 12
    assert all(0.0 <= p <= 1.0 for p in result)


def test_batch_predict_probs_shape():
    """batch_predict_probs returns (N, 12) array."""
    import torch
    mock_model = MagicMock()
    mock_model.return_value.logits = torch.zeros(2, 12)

    mock_tok = MagicMock()
    mock_tok.return_value = {
        'input_ids':      torch.zeros(2, 5, dtype=torch.long),
        'attention_mask': torch.ones(2, 5, dtype=torch.long),
    }

    import inference
    inference._model     = mock_model
    inference._tokenizer = mock_tok

    result = inference.batch_predict_probs(['CC', 'CC(=O)O'])
    assert result.shape == (2, 12)

    inference._model     = None
    inference._tokenizer = None
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_inference.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'inference'`

- [ ] **Step 3: Create backend/inference.py**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_inference.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add backend/inference.py backend/tests/test_inference.py
git commit -m "feat(backend): inference.py lazy model singleton with tests"
```

---

### Task 10: report.py

**Files:**
- Create: `backend/report.py`
- Create: `backend/tests/test_report.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_report.py`:

```python
# tests/test_report.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from tests.conftest import TARGET_NAMES, ASPIRIN

REQUIRED_KEYS = frozenset({
    'smiles', 'canonical_smiles', 'compound_name', 'structure_svg',
    'toxicity', 'admet', 'explainability', 'risk_summary',
})


def _make_mock_probs():
    return [0.1] * 12


def test_generate_report_returns_required_keys():
    with patch('report.predict_probs', return_value=_make_mock_probs()), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN, 'Aspirin')
    assert REQUIRED_KEYS == set(result.keys())


def test_toxicity_has_12_targets():
    with patch('report.predict_probs', return_value=_make_mock_probs()), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN)
    assert len(result['toxicity']) == 12


def test_risk_tier_low_for_safe_compound():
    with patch('report.predict_probs', return_value=[0.05] * 12), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN)
    assert result['risk_summary']['tier'] == 'Low'


def test_risk_tier_high_for_toxic_compound():
    with patch('report.predict_probs', return_value=[0.99] * 12), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN)
    assert result['risk_summary']['tier'] == 'High'


def test_structure_svg_is_svg_string():
    with patch('report.predict_probs', return_value=_make_mock_probs()), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN)
    assert isinstance(result['structure_svg'], str)
    assert '<svg' in result['structure_svg']


def test_composite_score_in_range():
    with patch('report.predict_probs', return_value=_make_mock_probs()), \
         patch('report._compute_explainability', return_value={}):
        from report import generate_report
        result = generate_report(ASPIRIN)
    score = result['risk_summary']['composite_score']
    assert 0.0 <= score <= 1.0
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_report.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'report'`

- [ ] **Step 3: Create backend/report.py**

```python
# backend/report.py
"""
Orchestrates generate_report(): the source of truth for the /analyze API response.
"""
import re
import numpy as np
import torch
from rdkit import Chem

from inference import (
    predict_probs, get_model, get_tokenizer,
    TARGET_NAMES, TARGET_IDX, THRESHOLDS, SEVERITY_WEIGHTS, DEVICE,
)
from chemistry import mol_to_svg, compute_admet

WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
WEIGHT_SUM   = WEIGHT_ARRAY.sum()

_ATOM_RE = re.compile(r'\[[^\]]+\]|Cl|Br|[BCNOPSFI]|[bcnops]')

_lig = None


def _get_lig():
    global _lig
    if _lig is None:
        from captum.attr import LayerIntegratedGradients

        m = get_model()

        def _forward(input_ids, attention_mask, target_idx):
            out = m(input_ids=input_ids, attention_mask=attention_mask)
            return torch.sigmoid(out.logits[:, target_idx])

        _lig = LayerIntegratedGradients(_forward, m.roberta.embeddings)
    return _lig


def _compute_explainability(canonical: str, mol: Chem.Mol, probs: list[float]) -> dict:
    """Run IG for top-3 targets by probability."""
    tok = get_tokenizer()
    enc = tok(canonical, return_tensors='pt', return_offsets_mapping=True,
              truncation=True, max_length=512)
    input_ids = enc['input_ids'].to(DEVICE)
    attn_mask = enc['attention_mask'].to(DEVICE)
    offsets   = enc['offset_mapping'][0].tolist()
    baseline  = torch.full_like(input_ids, tok.pad_token_id)

    positions = [(m.start(), m.end()) for m in _ATOM_RE.finditer(canonical)]
    a_map = {}
    for atom_idx, (a_start, _) in enumerate(positions):
        for tok_idx, (t_start, t_end) in enumerate(offsets):
            if t_start <= a_start < t_end:
                a_map[atom_idx] = tok_idx
                break

    lig = _get_lig()
    top_indices = np.argsort(probs)[-3:][::-1]
    result = {}
    for idx in top_indices:
        target_name = TARGET_NAMES[int(idx)]
        attrs, _ = lig.attribute(
            inputs=input_ids, baselines=baseline,
            additional_forward_args=(attn_mask, int(idx)),
            n_steps=30, return_convergence_delta=True,
        )
        token_scores = attrs.sum(dim=-1).squeeze(0).detach().cpu().numpy()
        atom_scores  = {
            i: float(token_scores[a_map[i]])
            if i in a_map and a_map[i] < len(token_scores) else 0.0
            for i in range(mol.GetNumAtoms())
        }
        top_atoms = [k for k, v in sorted(atom_scores.items(), key=lambda x: -x[1])[:5] if v > 0]
        result[target_name] = {
            "atom_scores": {str(k): round(v, 4) for k, v in atom_scores.items()},
            "top_atoms":   top_atoms,
        }
    return result


def generate_report(smiles: str, compound_name: str = "") -> dict:
    """Return structured compound safety profile. Source of truth for /analyze schema."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Cannot parse SMILES: {smiles!r}")
    canonical = Chem.MolToSmiles(mol)
    mol_can   = Chem.MolFromSmiles(canonical)

    probs = predict_probs(canonical)

    toxicity = {
        name: {
            "probability": round(probs[i], 4),
            "label":       "TOXIC" if probs[i] >= THRESHOLDS[name] else "safe",
            "threshold":   THRESHOLDS[name],
        }
        for i, name in enumerate(TARGET_NAMES)
    }

    admet          = compute_admet(mol_can)
    explainability = _compute_explainability(canonical, mol_can, probs)

    risk_score = float(np.dot(probs, WEIGHT_ARRAY) / WEIGHT_SUM)
    tier = "High" if risk_score > 0.5 else "Moderate" if risk_score > 0.25 else "Low"
    toxic_targets = [name for name, t in toxicity.items() if t["label"] == "TOXIC"]

    return {
        "smiles":           smiles,
        "canonical_smiles": canonical,
        "compound_name":    compound_name,
        "structure_svg":    mol_to_svg(mol_can),
        "toxicity":         toxicity,
        "admet":            admet,
        "explainability":   explainability,
        "risk_summary": {
            "composite_score": round(risk_score, 4),
            "tier":            tier,
            "toxic_targets":   toxic_targets,
            "flagged_targets": admet["pains_alerts"],
        },
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_report.py -v
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add backend/report.py backend/tests/test_report.py
git commit -m "feat(backend): report.py generate_report() with tests"
```

---

### Task 11: server.py and API Endpoint Tests

**Files:**
- Create: `backend/server.py`
- Create: `backend/tests/test_health.py`
- Create: `backend/tests/test_analyze.py`
- Create: `backend/tests/test_screen.py`

- [ ] **Step 1: Write failing tests for /health**

Create `backend/tests/test_health.py`:

```python
# tests/test_health.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch
import pytest


@pytest.fixture(scope='module')
def client():
    with patch('report.generate_report'), \
         patch('inference.batch_predict_probs'):
        from fastapi.testclient import TestClient
        from server import app
        return TestClient(app)


def test_health_status_ok(client):
    resp = client.get('/health')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'


def test_health_has_model_key(client):
    resp = client.get('/health')
    assert 'model' in resp.json()


def test_health_has_device_key(client):
    resp = client.get('/health')
    assert 'device' in resp.json()
```

- [ ] **Step 2: Write failing tests for /analyze**

Create `backend/tests/test_analyze.py`:

```python
# tests/test_analyze.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch
import pytest
from tests.conftest import ASPIRIN, STUB_REPORT


@pytest.fixture(scope='module')
def client():
    with patch('report.generate_report', return_value=STUB_REPORT), \
         patch('inference.batch_predict_probs'):
        from fastapi.testclient import TestClient
        from server import app
        return TestClient(app)


def test_analyze_valid_smiles_returns_200(client):
    resp = client.post('/analyze', json={'smiles': ASPIRIN, 'compound_name': 'Aspirin'})
    assert resp.status_code == 200


def test_analyze_response_has_required_keys(client):
    resp = client.post('/analyze', json={'smiles': ASPIRIN})
    body = resp.json()
    for key in ('smiles', 'toxicity', 'admet', 'risk_summary', 'explainability'):
        assert key in body, f"Missing key: {key}"


def test_analyze_invalid_smiles_returns_422(client):
    resp = client.post('/analyze', json={'smiles': 'NOT_A_SMILES_XYZ'})
    assert resp.status_code == 422


def test_analyze_missing_smiles_returns_422(client):
    resp = client.post('/analyze', json={})
    assert resp.status_code == 422


def test_analyze_cors_header_present(client):
    resp = client.options('/analyze', headers={'Origin': 'http://localhost:3000'})
    assert resp.headers.get('access-control-allow-origin') == '*'
```

- [ ] **Step 3: Write failing tests for /screen**

Create `backend/tests/test_screen.py`:

```python
# tests/test_screen.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from unittest.mock import patch
import pytest
from tests.conftest import ASPIRIN


@pytest.fixture(scope='module')
def client():
    with patch('report.generate_report'), \
         patch('inference.batch_predict_probs',
               return_value=np.array([[0.1] * 12])):
        from fastapi.testclient import TestClient
        from server import app
        return TestClient(app)


def test_screen_valid_smiles_returns_200(client):
    resp = client.post('/screen', json={'smiles_list': [ASPIRIN]})
    assert resp.status_code == 200


def test_screen_response_has_required_keys(client):
    resp = client.post('/screen', json={'smiles_list': [ASPIRIN]})
    body = resp.json()
    assert 'results' in body
    assert 'total_screened' in body
    assert 'shortlist_count' in body


def test_screen_results_sorted_by_risk_score(client):
    two_smiles = [ASPIRIN, 'Cn1c(=O)c2c(ncn2C)n(C)c1=O']
    with patch('inference.batch_predict_probs',
               return_value=np.array([[0.8] * 12, [0.1] * 12])):
        resp = client.post('/screen', json={'smiles_list': two_smiles})
    results = resp.json()['results']
    if len(results) >= 2:
        assert results[0]['risk_score'] <= results[1]['risk_score']


def test_screen_empty_list_returns_400(client):
    resp = client.post('/screen', json={'smiles_list': []})
    assert resp.status_code == 400


def test_screen_all_invalid_smiles_returns_422(client):
    resp = client.post('/screen', json={'smiles_list': ['INVALID', 'ALSO_INVALID']})
    assert resp.status_code == 422
```

- [ ] **Step 4: Run to verify all tests fail**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/test_health.py tests/test_analyze.py tests/test_screen.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 5: Create backend/server.py**

```python
# backend/server.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import numpy as np
from rdkit import Chem

from inference import (
    batch_predict_probs, TARGET_NAMES, THRESHOLDS, SEVERITY_WEIGHTS, MODEL_DIR, DEVICE,
)
from report import generate_report
from chemistry import lipinski_pass, veber_pass, get_pains_alerts

app = FastAPI(title="Drug Discovery API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
_WEIGHT_SUM   = _WEIGHT_ARRAY.sum()


class AnalyzeRequest(BaseModel):
    smiles: str
    compound_name: Optional[str] = ""


class ScreenRequest(BaseModel):
    smiles_list: list[str]
    max_compounds: Optional[int] = 50


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_DIR, "device": DEVICE}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if Chem.MolFromSmiles(req.smiles) is None:
        raise HTTPException(status_code=422, detail="Invalid SMILES string")
    return generate_report(req.smiles, req.compound_name or "")


@app.post("/screen")
def screen(req: ScreenRequest):
    if not req.smiles_list:
        raise HTTPException(status_code=400, detail="smiles_list cannot be empty")

    smiles_capped = req.smiles_list[:100]  # hard cap
    valid_pairs = [(s, Chem.MolFromSmiles(s)) for s in smiles_capped]
    valid_pairs = [(s, m) for s, m in valid_pairs if m is not None]

    if not valid_pairs:
        raise HTTPException(status_code=422, detail="No valid SMILES strings provided")

    valid_smiles = [s for s, _ in valid_pairs]
    valid_mols   = [m for _, m in valid_pairs]
    probs = batch_predict_probs(valid_smiles)
    risk_scores = (probs * _WEIGHT_ARRAY).sum(axis=1) / _WEIGHT_SUM

    results = []
    for i, (smiles, mol) in enumerate(valid_pairs):
        results.append({
            "smiles":        smiles,
            "risk_score":    round(float(risk_scores[i]), 4),
            "lipinski_pass": lipinski_pass(mol),
            "veber_pass":    veber_pass(mol),
            "pains_alerts":  get_pains_alerts(mol),
            **{t: round(float(probs[i, j]), 4) for j, t in enumerate(TARGET_NAMES)},
        })

    results.sort(key=lambda x: x["risk_score"])
    shortlist = results[:req.max_compounds]

    return {
        "results":        shortlist,
        "total_screened": len(valid_pairs),
        "shortlist_count": len(shortlist),
    }
```

- [ ] **Step 6: Run all tests to verify they pass**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/ -v --ignore=tests/test_inference.py
```

Expected: all tests pass (inference tests are excluded here as they mock internals directly)

- [ ] **Step 7: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add backend/server.py backend/tests/test_health.py backend/tests/test_analyze.py backend/tests/test_screen.py
git commit -m "feat(backend): FastAPI server with /health, /analyze, /screen endpoints and full test coverage"
```

---

### Task 12: Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create backend/Dockerfile**

```dockerfile
# backend/Dockerfile
# Build context must be the project root: docker build -f backend/Dockerfile .
FROM python:3.12-slim

WORKDIR /app

# System deps required by RDKit
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxrender1 libxext6 \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (large, separate layer for caching)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY backend/requirements.txt /tmp/requirements.txt
RUN grep -v '^torch' /tmp/requirements.txt | \
    grep -v '^#' | \
    grep -v '^pytest' | \
    grep -v '^httpx' | \
    pip install --no-cache-dir -r /dev/stdin

# Pre-download model from HuggingFace Hub into image layer (runs once at build time)
# Container starts instantly — no download delay at runtime
RUN python -c "\
from transformers import AutoTokenizer, AutoModelForSequenceClassification; \
AutoModelForSequenceClassification.from_pretrained('mike-malloy/chemberta-tox21-multitarget'); \
AutoTokenizer.from_pretrained('mike-malloy/chemberta-tox21-multitarget'); \
print('Model cached.')"

# Copy application source
COPY backend/server.py backend/inference.py backend/chemistry.py backend/report.py /app/

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

- [ ] **Step 2: Verify Docker build succeeds locally**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
docker build -f backend/Dockerfile -t drug-discovery-backend . 2>&1 | tail -5
```

Expected: `Successfully built <image-id>` (takes 5-15 minutes on first build)

- [ ] **Step 3: Smoke-test the container locally**

```bash
docker run --rm -p 8000:8000 drug-discovery-backend &
sleep 30  # wait for model to load
curl -s http://localhost:8000/health | python3 -c "import sys,json; print(json.load(sys.stdin))"
```

Expected: `{'status': 'ok', 'model': '...', 'device': 'cpu'}`

```bash
docker stop $(docker ps -q --filter ancestor=drug-discovery-backend)
```

- [ ] **Step 4: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add backend/Dockerfile
git commit -m "feat(backend): Dockerfile — python:3.12-slim, CPU torch, baked checkpoint"
```

---

## Phase 4: Infrastructure — Terraform + Scripts

### Task 13: Terraform Configuration

**Files:**
- Create: `terraform/versions.tf`
- Create: `terraform/variables.tf`
- Create: `terraform/main.tf`
- Create: `terraform/outputs.tf`
- Create: `terraform/backend.tf`

- [ ] **Step 1: Create terraform/versions.tf**

```hcl
# terraform/versions.tf
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

- [ ] **Step 2: Create terraform/backend.tf**

```hcl
# terraform/backend.tf
# Local state for portfolio use — upgrade to S3 backend for team use
terraform {
  backend "local" {}
}
```

- [ ] **Step 3: Create terraform/variables.tf**

```hcl
# terraform/variables.tf
variable "project_name" {
  description = "Prefix for all AWS resource names"
  type        = string
  default     = "drug-discovery"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "app_runner_cpu" {
  description = "vCPU allocation for App Runner"
  type        = string
  default     = "1 vCPU"
}

variable "app_runner_memory" {
  description = "Memory allocation for App Runner"
  type        = string
  default     = "3 GB"
}
```

- [ ] **Step 4: Create terraform/main.tf**

```hcl
# terraform/main.tf

resource "random_id" "suffix" {
  byte_length = 4
}

# ── ECR Repository ────────────────────────────────────────────────────────
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

# ── IAM: App Runner → ECR access ─────────────────────────────────────────
resource "aws_iam_role" "apprunner_ecr_access" {
  name = "${var.project_name}-apprunner-ecr-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "build.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# ── App Runner Service ────────────────────────────────────────────────────
resource "aws_apprunner_service" "backend" {
  service_name = "${var.project_name}-backend"

  source_configuration {
    image_repository {
      image_identifier      = "${aws_ecr_repository.backend.repository_url}:latest"
      image_configuration {
        port = "8000"
        runtime_environment_variables = {
          PYTHONUNBUFFERED = "1"
        }
      }
      image_repository_type = "ECR"
    }
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }
    auto_deployments_enabled = false
  }

  instance_configuration {
    cpu    = var.app_runner_cpu
    memory = var.app_runner_memory
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 20
    timeout             = 10
    healthy_threshold   = 1
    unhealthy_threshold = 3
  }
}

# ── S3 Frontend Hosting ───────────────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-frontend-${random_id.suffix.hex}"
  force_destroy = true
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  depends_on = [aws_s3_bucket_public_access_block.frontend]
  bucket     = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
}
```

- [ ] **Step 5: Create terraform/outputs.tf**

```hcl
# terraform/outputs.tf
output "api_url" {
  description = "App Runner HTTPS endpoint"
  value       = "https://${aws_apprunner_service.backend.service_url}"
}

output "ecr_repository_url" {
  description = "ECR repository URL for docker push"
  value       = aws_ecr_repository.backend.repository_url
}

output "frontend_url" {
  description = "S3 static website URL"
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
}

output "frontend_bucket" {
  description = "S3 bucket name for frontend sync"
  value       = aws_s3_bucket.frontend.id
}
```

- [ ] **Step 6: Validate Terraform configuration**

```bash
cd "/Volumes/Hub/dev/Drug Discovery/terraform"
terraform init
terraform validate
```

Expected: `Success! The configuration is valid.`

- [ ] **Step 7: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add terraform/
git commit -m "feat(infra): Terraform — ECR, App Runner, S3 frontend hosting"
```

---

### Task 14: Build Script

**Files:**
- Create: `scripts/build.py`
- Create: `scripts/tests/test_build.py`

- [ ] **Step 1: Write failing test for build.py**

```bash
mkdir -p "/Volumes/Hub/dev/Drug Discovery/scripts/tests"
touch "/Volumes/Hub/dev/Drug Discovery/scripts/tests/__init__.py"
```

Create `scripts/tests/test_build.py`:

```python
# scripts/tests/test_build.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from unittest.mock import patch, MagicMock


def test_dockerfile_exists():
    project_root = os.path.join(os.path.dirname(__file__), '..', '..')
    dockerfile   = os.path.join(project_root, 'backend', 'Dockerfile')
    assert os.path.exists(dockerfile), f"Dockerfile not found at {dockerfile}"


def test_checkpoint_directory_exists():
    import glob
    project_root = os.path.join(os.path.dirname(__file__), '..', '..')
    checkpoints  = glob.glob(os.path.join(project_root, 'chemberta-tox21-multitarget-*'))
    assert len(checkpoints) > 0, "No chemberta-tox21-multitarget-* checkpoint found"


def test_get_aws_account_id_calls_sts():
    from build import get_aws_account_id
    mock_sts = MagicMock()
    mock_sts.get_caller_identity.return_value = {'Account': '123456789012'}
    with patch('build.boto3') as mock_boto3:
        mock_boto3.client.return_value = mock_sts
        account_id = get_aws_account_id()
    assert account_id == '123456789012'
    mock_boto3.client.assert_called_once_with('sts')


def test_build_image_name_format():
    """Image tag should follow <project>-backend format."""
    from build import make_image_name
    name = make_image_name(project='drug-discovery')
    assert name == 'drug-discovery-backend'
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
python -m pytest scripts/tests/test_build.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'build'`

- [ ] **Step 3: Create scripts/build.py**

```python
#!/usr/bin/env python3
# scripts/build.py — Build Docker image and push to ECR
import base64
import os
import subprocess
import sys
import boto3

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_aws_account_id() -> str:
    return boto3.client('sts').get_caller_identity()['Account']


def make_image_name(project: str) -> str:
    return f"{project}-backend"


def get_ecr_login(region: str, account_id: str):
    ecr  = boto3.client('ecr', region_name=region)
    data = ecr.get_authorization_token(registryIds=[account_id])
    auth = data['authorizationData'][0]
    password = base64.b64decode(auth['authorizationToken']).decode().split(':')[1]
    return password, auth['proxyEndpoint']


def run(cmd: list[str], **kwargs):
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, check=True, **kwargs)


def main():
    region  = os.environ.get('AWS_REGION', 'us-east-1')
    project = os.environ.get('PROJECT_NAME', 'drug-discovery')

    account_id = get_aws_account_id()
    image_name = make_image_name(project)
    repo_url   = f"{account_id}.dkr.ecr.{region}.amazonaws.com/{image_name}"

    # ECR login
    password, endpoint = get_ecr_login(region, account_id)
    run(['docker', 'login', '--username', 'AWS', '--password-stdin', endpoint],
        input=password.encode())

    # Build from project root so Dockerfile can COPY checkpoint
    run(['docker', 'build',
         '-f', os.path.join(PROJECT_ROOT, 'backend', 'Dockerfile'),
         '-t', image_name,
         PROJECT_ROOT])

    # Tag and push
    run(['docker', 'tag', f'{image_name}:latest', f'{repo_url}:latest'])
    run(['docker', 'push', f'{repo_url}:latest'])
    print(f"\nPushed: {repo_url}:latest")


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
python -m pytest scripts/tests/test_build.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/build.py scripts/tests/
git commit -m "feat(scripts): build.py — Docker build and ECR push with tests"
```

---

### Task 15: Deploy, Destroy, and Smoke Test Scripts

**Files:**
- Create: `scripts/deploy.py`
- Create: `scripts/destroy.py`
- Create: `scripts/test_api.sh`

- [ ] **Step 1: Create scripts/deploy.py**

```python
#!/usr/bin/env python3
# scripts/deploy.py — terraform apply + App Runner trigger + S3 frontend sync
import json
import os
import subprocess
import sys

SCRIPTS_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT  = os.path.dirname(SCRIPTS_DIR)
TERRAFORM_DIR = os.path.join(PROJECT_ROOT, 'terraform')
FRONTEND_OUT  = os.path.join(PROJECT_ROOT, 'frontend', 'out')


def run(cmd: list[str], cwd: str = None, capture: bool = False):
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=True, cwd=cwd,
                          capture_output=capture, text=capture)


def tf_output(key: str) -> str:
    result = run(['terraform', 'output', '-raw', key],
                 cwd=TERRAFORM_DIR, capture=True)
    return result.stdout.strip()


def main():
    region = os.environ.get('AWS_REGION', 'us-east-1')

    # Terraform init + apply
    run(['terraform', 'init'], cwd=TERRAFORM_DIR)
    run(['terraform', 'apply', '-auto-approve'], cwd=TERRAFORM_DIR)

    api_url = tf_output('api_url')
    print(f"\nAPI URL: {api_url}")

    # Sync frontend if built
    if os.path.isdir(FRONTEND_OUT):
        bucket = tf_output('frontend_bucket')
        run(['aws', 's3', 'sync', FRONTEND_OUT, f's3://{bucket}',
             '--delete', '--region', region])
        frontend_url = tf_output('frontend_url')
        print(f"Frontend URL: {frontend_url}")
    else:
        print(f"(Frontend not built — {FRONTEND_OUT} not found, skipping S3 sync)")

    print("\nDeployment complete.")
    print(f"  API: {api_url}/health")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Create scripts/destroy.py**

```python
#!/usr/bin/env python3
# scripts/destroy.py — tear down all AWS resources
import os
import subprocess

TERRAFORM_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'terraform')


def main():
    print("Destroying all AWS resources (this cannot be undone)...")
    subprocess.run(['terraform', 'destroy', '-auto-approve'],
                   check=True, cwd=TERRAFORM_DIR)
    print("All resources destroyed. AWS costs zeroed.")


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Create scripts/test_api.sh**

```bash
#!/usr/bin/env bash
# scripts/test_api.sh — smoke tests against live App Runner URL
# Usage: ./scripts/test_api.sh [API_URL]
set -e

API_URL="${1:-}"
if [ -z "$API_URL" ]; then
    API_URL=$(cd "$(dirname "$0")/../terraform" && terraform output -raw api_url 2>/dev/null)
fi

if [ -z "$API_URL" ]; then
    echo "ERROR: Could not determine API URL. Pass it as argument or run terraform apply first."
    exit 1
fi

ASPIRIN="CC(=O)Oc1ccccc1C(=O)O"
PASS=0; FAIL=0

check() {
    local desc="$1"; local expected="$2"; local actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $desc"
        PASS=$((PASS+1))
    else
        echo "  ✗ $desc (expected=$expected, got=$actual)"
        FAIL=$((FAIL+1))
    fi
}

echo "Smoke testing: $API_URL"
echo ""

# Health
echo "GET /health"
status=$(curl -sf "$API_URL/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check "status == ok" "ok" "$status"

# Analyze — valid SMILES
echo "POST /analyze (valid)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/analyze" \
    -H "Content-Type: application/json" \
    -d "{\"smiles\":\"$ASPIRIN\",\"compound_name\":\"Aspirin\"}")
check "HTTP 200" "200" "$code"

# Analyze — invalid SMILES
echo "POST /analyze (invalid SMILES)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/analyze" \
    -H "Content-Type: application/json" \
    -d '{"smiles":"INVALID_XYZ"}')
check "HTTP 422" "422" "$code"

# Screen
echo "POST /screen"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/screen" \
    -H "Content-Type: application/json" \
    -d "{\"smiles_list\":[\"$ASPIRIN\"]}")
check "HTTP 200" "200" "$code"

# Screen — empty list
echo "POST /screen (empty list)"
code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$API_URL/screen" \
    -H "Content-Type: application/json" \
    -d '{"smiles_list":[]}')
check "HTTP 400" "400" "$code"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
```

```bash
chmod +x "/Volumes/Hub/dev/Drug Discovery/scripts/test_api.sh"
```

- [ ] **Step 4: Commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add scripts/deploy.py scripts/destroy.py scripts/test_api.sh
git commit -m "feat(scripts): deploy.py, destroy.py, test_api.sh smoke tests"
```

---

### Task 16: End-to-End Deployment Verification

*Perform once the image is built and pushed.*

- [ ] **Step 1: Build and push Docker image to ECR**

```bash
export AWS_REGION=us-east-1
export PROJECT_NAME=drug-discovery
cd "/Volumes/Hub/dev/Drug Discovery"
python scripts/build.py
```

Expected: `Pushed: <account-id>.dkr.ecr.us-east-1.amazonaws.com/drug-discovery-backend:latest`

- [ ] **Step 2: Deploy infrastructure**

```bash
python scripts/deploy.py
```

Expected output includes `API URL: https://...` (App Runner URL)

- [ ] **Step 3: Run smoke tests against live endpoint**

```bash
./scripts/test_api.sh
```

Expected: `5 passed, 0 failed`

- [ ] **Step 4: Tear down to zero cost**

```bash
python scripts/destroy.py
```

Expected: `All resources destroyed. AWS costs zeroed.`

- [ ] **Step 5: Final commit**

```bash
cd "/Volumes/Hub/dev/Drug Discovery"
git add -A
git commit -m "chore: end-to-end deployment verified"
```

---

## Phase 5: Frontend

*Implementation deferred — awaiting detailed UI spec from user.*

Assumed starting point once spec is provided:
- `npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir`
- Two views: single-compound analyze form + batch screening form
- API base URL configured via `NEXT_PUBLIC_API_URL` environment variable
- Static export (`output: 'export'` in `next.config.ts`) for S3 hosting

---

## Quick Reference

### Run all backend tests
```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
python -m pytest tests/ -v
```

### Run local server (requires model checkpoint)
```bash
cd "/Volumes/Hub/dev/Drug Discovery/backend"
uvicorn server:app --reload --port 8000
```

### Rebuild and redeploy
```bash
cd "/Volumes/Hub/dev/Drug Discovery"
python scripts/build.py && python scripts/deploy.py
```

### Full teardown
```bash
python scripts/destroy.py
```
