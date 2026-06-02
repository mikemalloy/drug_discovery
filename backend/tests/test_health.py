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
