# backend/tests/test_auth.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from tests.conftest import ASPIRIN


def test_analyze_without_token_returns_403():
    from fastapi.testclient import TestClient
    from server import app, clerk_guard
    # Ensure no overrides from other test modules
    saved = app.dependency_overrides.copy()
    app.dependency_overrides.clear()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post('/analyze', json={'smiles': ASPIRIN})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.update(saved)


def test_screen_without_token_returns_403():
    from fastapi.testclient import TestClient
    from server import app, clerk_guard
    saved = app.dependency_overrides.copy()
    app.dependency_overrides.clear()
    try:
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post('/screen', json={'smiles_list': [ASPIRIN]})
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.update(saved)


def test_health_without_token_returns_200():
    from fastapi.testclient import TestClient
    from server import app
    client = TestClient(app)
    resp = client.get('/health')
    assert resp.status_code == 200
