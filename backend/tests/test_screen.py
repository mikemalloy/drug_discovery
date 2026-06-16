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
        yield TestClient(app)


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
