# backend/tests/test_auth.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch
from tests.conftest import ASPIRIN, STUB_REPORT


def test_analyze_without_token_returns_200():
    with patch('report.generate_report', return_value=STUB_REPORT), \
         patch('inference.batch_predict_probs'):
        from fastapi.testclient import TestClient
        from server import app
        client = TestClient(app)
        resp = client.post('/analyze', json={'smiles': ASPIRIN})
        assert resp.status_code == 200


def test_screen_without_token_returns_200():
    import numpy as np
    with patch('inference.batch_predict_probs',
               return_value=np.array([[0.1] * 12])):
        from fastapi.testclient import TestClient
        from server import app
        client = TestClient(app)
        resp = client.post('/screen', json={'smiles_list': [ASPIRIN]})
        assert resp.status_code == 200


def test_health_without_token_returns_200():
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)
    resp = client.get('/health')
    assert resp.status_code == 200
