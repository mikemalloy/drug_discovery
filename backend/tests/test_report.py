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
    'applicability_domain',
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
