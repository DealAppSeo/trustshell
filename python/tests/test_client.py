"""
Python TrustShell tests (Phase 2)
"""

from unittest.mock import patch, MagicMock
from trustshell import TrustShell

def test_score_inverts_risk_to_trust():
    """hal_score 0.1 (low risk) -> trust_score 90"""
    with patch('httpx.post') as mock_post:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "hal_score": 0.1,
            "hal_verdict": "PASS",
            "hal_flagged_hallucination": False,
            "hal_signals": {},
            "provider_used": "demo",
        }
        mock_post.return_value = mock_resp
        shell = TrustShell()
        result = shell.score("The capital of France is Paris.")
        assert result.trust_score == 90
        assert result.hal_score == 0.1

def test_score_passes_provider():
    with patch('httpx.post') as mock_post:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"hal_score": 0.5, "hal_verdict": "PASS", "hal_signals": {}, "provider_used": "openai"}
        mock_post.return_value = mock_resp
        shell = TrustShell()
        result = shell.score("text", provider="openai")
        # verify call
        call_args = mock_post.call_args
        assert call_args[1]["json"]["provider"] == "openai"
