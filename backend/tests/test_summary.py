# tests/test_summary.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch, MagicMock
from tests.conftest import STUB_REPORT


def _fake_anthropic_module(captured: dict):
    """A stand-in `anthropic` module whose client records the call and returns
    a fixed markdown response, so we never hit the network."""
    text_block = MagicMock()
    text_block.type = "text"
    text_block.text = "### Overview\nModel-estimated low risk."

    resp = MagicMock()
    resp.content = [text_block]
    resp.usage = MagicMock(input_tokens=123, output_tokens=45)

    def create(**kwargs):
        captured.update(kwargs)
        return resp

    client = MagicMock()
    client.messages.create.side_effect = create

    module = MagicMock()
    module.Anthropic.return_value = client
    return module


def test_degrades_without_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    import summary
    out = summary.generate_summary(STUB_REPORT)
    assert out["available"] is False
    assert "ANTHROPIC_API_KEY" in out["reason"]


def test_returns_markdown_and_governance(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    captured = {}
    import summary
    # keep the audit log out of the repo dir during tests
    monkeypatch.setattr(summary, "_AUDIT_PATH", str(tmp_path / "audit.jsonl"))

    with patch.dict(sys.modules, {"anthropic": _fake_anthropic_module(captured)}):
        out = summary.generate_summary(STUB_REPORT)

    assert out["available"] is True
    assert out["markdown"].startswith("### Overview")
    gov = out["governance"]
    assert gov["temperature"] == 0
    assert len(gov["prompt_sha256"]) == 64
    assert len(gov["input_report_sha256"]) == 64
    assert gov["input_tokens"] == 123 and gov["output_tokens"] == 45
    # audit record was written
    assert os.path.exists(str(tmp_path / "audit.jsonl"))


def test_prompt_is_grounded_and_constrained(monkeypatch):
    """The model must be sent the system guardrails + only the report projection,
    never raw SVG or free-form instructions."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    captured = {}
    import summary
    monkeypatch.setattr(summary, "_AUDIT_PATH", os.devnull)

    with patch.dict(sys.modules, {"anthropic": _fake_anthropic_module(captured)}):
        summary.generate_summary(STUB_REPORT)

    system = captured["system"]
    assert "ONLY" in system and "recommendation" in system.lower()
    assert captured["temperature"] == 0
    user_msg = captured["messages"][0]["content"]
    assert "CANONICAL SMILES" in user_msg
    assert "APPLICABILITY DOMAIN" in user_msg
    assert "<svg" not in user_msg  # raw structure must not leak into the prompt
