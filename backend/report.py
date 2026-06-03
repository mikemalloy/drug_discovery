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
            "label":       "toxic" if probs[i] >= THRESHOLDS[name] else "safe",
            "threshold":   THRESHOLDS[name],
        }
        for i, name in enumerate(TARGET_NAMES)
    }

    admet          = compute_admet(mol_can)
    explainability = _compute_explainability(canonical, mol_can, probs)

    risk_score = float(np.dot(probs, WEIGHT_ARRAY) / WEIGHT_SUM)
    tier = "High" if risk_score > 0.5 else "Moderate" if risk_score > 0.25 else "Low"
    toxic_targets = [name for name, t in toxicity.items() if t["label"] == "toxic"]

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
