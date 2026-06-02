# tests/test_inference.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
import numpy as np
from unittest.mock import patch, MagicMock


def test_target_names_has_12_entries():
    from inference import TARGET_NAMES
    assert len(TARGET_NAMES) == 12


def test_thresholds_covers_all_targets():
    from inference import TARGET_NAMES, THRESHOLDS
    assert set(THRESHOLDS.keys()) == set(TARGET_NAMES)


def test_severity_weights_covers_all_targets():
    from inference import TARGET_NAMES, SEVERITY_WEIGHTS
    assert set(SEVERITY_WEIGHTS.keys()) == set(TARGET_NAMES)


def test_predict_probs_returns_12_floats():
    """predict_probs returns exactly 12 float probabilities in [0,1]."""
    mock_model = MagicMock()
    mock_logits = __import__('torch').zeros(1, 12)
    mock_model.return_value.logits = mock_logits

    mock_tok = MagicMock()
    mock_tok.return_value = {
        'input_ids':      __import__('torch').zeros(1, 5, dtype=__import__('torch').long),
        'attention_mask': __import__('torch').ones(1, 5, dtype=__import__('torch').long),
    }

    import inference
    original_model = inference._model
    original_tok   = inference._tokenizer
    inference._model     = mock_model
    inference._tokenizer = mock_tok

    result = inference.predict_probs('CC(=O)Oc1ccccc1C(=O)O')

    inference._model     = original_model
    inference._tokenizer = original_tok

    assert len(result) == 12
    assert all(0.0 <= p <= 1.0 for p in result)


def test_batch_predict_probs_shape():
    """batch_predict_probs returns (N, 12) array."""
    import torch
    mock_model = MagicMock()
    mock_model.return_value.logits = torch.zeros(2, 12)

    mock_tok = MagicMock()
    mock_tok.return_value = {
        'input_ids':      torch.zeros(2, 5, dtype=torch.long),
        'attention_mask': torch.ones(2, 5, dtype=torch.long),
    }

    import inference
    inference._model     = mock_model
    inference._tokenizer = mock_tok

    result = inference.batch_predict_probs(['CC', 'CC(=O)O'])
    assert result.shape == (2, 12)

    inference._model     = None
    inference._tokenizer = None
