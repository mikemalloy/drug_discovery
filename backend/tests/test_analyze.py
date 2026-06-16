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
        yield TestClient(app)


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
