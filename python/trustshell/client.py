"""
TrustShell Python SDK (S-BUILD Phase 2)
Minimal client mirroring the TS implementation.
"""

import httpx
from dataclasses import dataclass
from typing import Optional, Dict

@dataclass
class ScoreResult:
    trust_score: int
    hal_score: float
    signals: Dict[str, float]
    verdict: str
    flagged_hallucination: bool
    provider: str
    model: str
    proof_hash: Optional[str] = None
    session_id: Optional[str] = None

class TrustShell:
    def __init__(self, api_key: Optional[str] = None, api_url: Optional[str] = None):
        self.api_url = api_url or "https://repid-engine-production.up.railway.app"
        self.api_key = api_key

    def score(self, response: str, prompt: Optional[str] = None,
              provider: str = "unknown", model: Optional[str] = None) -> ScoreResult:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        resp = httpx.post(
            f"{self.api_url}/api/v1/hal/evaluate",
            json={"response": response, "prompt": prompt, "provider": provider, "model": model},
            headers=headers,
            timeout=30.0
        )
        resp.raise_for_status()
        data = resp.json()

        return ScoreResult(
            trust_score=round((1 - (data.get("hal_score", 0))) * 100),
            hal_score=data.get("hal_score", 0),
            signals=data.get("hal_signals", {}),
            verdict=data.get("hal_verdict", "PASS"),
            flagged_hallucination=data.get("hal_flagged_hallucination", False),
            provider=data.get("provider_used", provider),
            model=data.get("model_used", model or "unknown"),
            proof_hash=data.get("proof_hash"),
            session_id=data.get("session_id"),
        )
