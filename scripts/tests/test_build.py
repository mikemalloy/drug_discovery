# scripts/tests/test_build.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from unittest.mock import patch, MagicMock


def test_dockerfile_exists():
    project_root = os.path.join(os.path.dirname(__file__), '..', '..')
    dockerfile   = os.path.join(project_root, 'backend', 'Dockerfile')
    assert os.path.exists(dockerfile), f"Dockerfile not found at {dockerfile}"


def test_checkpoint_directory_exists():
    import glob
    project_root = os.path.join(os.path.dirname(__file__), '..', '..')
    checkpoints  = glob.glob(os.path.join(project_root, 'chemberta-tox21-multitarget-*'))
    assert len(checkpoints) > 0, "No chemberta-tox21-multitarget-* checkpoint found"


def test_get_aws_account_id_calls_sts():
    from build import get_aws_account_id
    mock_sts = MagicMock()
    mock_sts.get_caller_identity.return_value = {'Account': '123456789012'}
    with patch('build.boto3') as mock_boto3:
        mock_boto3.client.return_value = mock_sts
        account_id = get_aws_account_id()
    assert account_id == '123456789012'
    mock_boto3.client.assert_called_once_with('sts')


def test_build_image_name_format():
    """Image tag should follow <project>-backend format."""
    from build import make_image_name
    name = make_image_name(project='drug-discovery')
    assert name == 'drug-discovery-backend'
