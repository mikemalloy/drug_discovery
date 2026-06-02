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
