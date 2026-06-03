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
    mw   = Descriptors.MolWt(mol)
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
    mw, logp = Descriptors.MolWt(mol), Descriptors.MolLogP(mol)
    hbd, hba  = Descriptors.NumHDonors(mol), Descriptors.NumHAcceptors(mol)
    return (int(mw > 500) + int(logp > 5) + int(hbd > 5) + int(hba > 10)) <= 1


def veber_pass(mol: Chem.Mol) -> bool:
    return Descriptors.TPSA(mol) <= 140 and Descriptors.NumRotatableBonds(mol) <= 10
