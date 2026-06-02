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
