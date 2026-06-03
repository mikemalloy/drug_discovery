# backend/applicability.py
"""
Applicability domain (AD) via Tanimoto k-NN on Morgan fingerprints.

THE QUESTION THIS ANSWERS
    A ROC-AUC of 0.78 describes how the model does on molecules *like its training
    set*. If a user pastes something chemically unlike anything in Tox21, the model
    still emits a confident-looking number -- but it is extrapolating, and that number
    is untrustworthy. The applicability domain is the guardrail that asks:
    "is this molecule similar enough to the training molecules to trust the prediction?"

HOW IT WORKS
    Each molecule becomes a Morgan fingerprint (a bit-vector marking which circular
    substructures it contains). Tanimoto similarity = (shared bits) / (union of bits),
    so 1.0 is identical chemistry and 0.0 is no shared substructure. For a query we
    take its mean similarity to the k nearest training molecules. If that falls below
    a data-driven threshold, we flag it out-of-domain.

THE REFERENCE SET
    backend/ad_reference_smiles.json holds the EXACT scaffold-split training molecules
    (produced by the export cell in chemberta_tox21_multitarget.ipynb), so "in domain"
    literally means "resembles what the model learned from." The file also carries a
    precomputed threshold (the 5th percentile of each training molecule's own
    leave-one-out mean-top-k similarity) so the backend never pays an all-pairs cost
    at startup -- it only fingerprints the query at inference time.

BONUS
    The nearest neighbors we return double as the "retrieval of similar molecules"
    feature on the roadmap -- same computation, surfaced to the user.
"""
import json
import os

_REF_PATH = os.path.join(os.path.dirname(__file__), "ad_reference_smiles.json")

# Fingerprint settings. Must match whatever the reference file was built with;
# we read the file's own params and fall back to these defaults.
DEFAULT_FP_RADIUS = 2
DEFAULT_FP_BITS = 2048
DEFAULT_K = 5
# Fallback threshold if the reference file doesn't carry a precomputed one.
# 0.30 mean-top-k Tanimoto is a common Morgan(r=2) out-of-domain heuristic.
DEFAULT_THRESHOLD = 0.30

_ref_smiles = None     # list[str]
_ref_fps = None        # list[ExplicitBitVect]
_gen = None            # Morgan fingerprint generator
_threshold = None      # float
_k = None              # int
_loaded = False


def _build_generator(radius: int, bits: int):
    from rdkit.Chem import rdFingerprintGenerator
    return rdFingerprintGenerator.GetMorganGenerator(radius=radius, fpSize=bits)


def _load():
    """Lazy one-time load: read reference SMILES + params, build fingerprints."""
    global _ref_smiles, _ref_fps, _gen, _threshold, _k, _loaded
    if _loaded:
        return
    from rdkit import Chem
    from rdkit import RDLogger
    RDLogger.DisableLog("rdApp.*")

    if not os.path.exists(_REF_PATH):
        raise FileNotFoundError(
            f"AD reference not found: {_REF_PATH}. Generate it with the export cell "
            f"in chemberta_tox21_multitarget.ipynb and drop it into backend/."
        )

    with open(_REF_PATH) as f:
        ref = json.load(f)

    params    = ref.get("params", {})
    radius    = params.get("fp_radius", DEFAULT_FP_RADIUS)
    bits      = params.get("fp_bits", DEFAULT_FP_BITS)
    _k        = params.get("k", DEFAULT_K)
    _threshold = ref.get("threshold", DEFAULT_THRESHOLD)
    smiles_in = ref["smiles"]

    _gen = _build_generator(radius, bits)
    _ref_smiles, _ref_fps = [], []
    for smi in smiles_in:
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            continue
        _ref_smiles.append(smi)
        _ref_fps.append(_gen.GetFingerprint(mol))
    _loaded = True
    print(f"[applicability] {len(_ref_fps)} reference fingerprints, "
          f"k={_k}, threshold={_threshold:.3f}")


def ad_assessment(smiles: str) -> dict:
    """Assess whether `smiles` lies inside the model's applicability domain.

    Returns a dict with the in/out verdict, the similarity evidence, and the
    nearest training neighbors (which double as molecular retrieval).
    """
    from rdkit import Chem
    from rdkit import DataStructs
    _load()

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return {"in_domain": False, "reliability": "invalid",
                "reason": "unparseable SMILES"}

    fp = _gen.GetFingerprint(mol)
    sims = DataStructs.BulkTanimotoSimilarity(fp, _ref_fps)  # one float per ref mol

    # k nearest reference molecules
    order = sorted(range(len(sims)), key=lambda i: sims[i], reverse=True)[:_k]
    topk = [sims[i] for i in order]
    max_sim   = float(topk[0]) if topk else 0.0
    mean_topk = float(sum(topk) / len(topk)) if topk else 0.0

    in_domain = mean_topk >= _threshold
    # 3-tier label: comfortably inside, borderline, or outside.
    if mean_topk >= _threshold * 1.5:
        reliability = "high"
    elif in_domain:
        reliability = "moderate"
    else:
        reliability = "low"

    neighbors = [
        {"smiles": _ref_smiles[i], "similarity": round(float(sims[i]), 3)}
        for i in order
    ]
    return {
        "in_domain": bool(in_domain),
        "reliability": reliability,
        "max_similarity": round(max_sim, 3),
        "mean_top_k_similarity": round(mean_topk, 3),
        "k": _k,
        "threshold": round(float(_threshold), 3),
        "nearest_neighbors": neighbors,
    }
