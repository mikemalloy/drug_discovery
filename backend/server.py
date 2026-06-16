# backend/server.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import numpy as np
from rdkit import Chem

import inference
import report
from inference import (
    TARGET_NAMES, THRESHOLDS, SEVERITY_WEIGHTS, MODEL_DIR, DEVICE,
)
from chemistry import lipinski_pass, veber_pass, get_pains_alerts

app = FastAPI(title="Drug Discovery API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
_WEIGHT_SUM   = _WEIGHT_ARRAY.sum()


class AnalyzeRequest(BaseModel):
    smiles: str
    compound_name: Optional[str] = ""


class ScreenRequest(BaseModel):
    smiles_list: list[str]
    max_compounds: Optional[int] = 50


class SummarizeRequest(BaseModel):
    # The structured report returned by /analyze. Accepting it back avoids
    # recomputing the (slow) explainability pass just to write a summary.
    report: dict


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_DIR, "device": DEVICE}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if Chem.MolFromSmiles(req.smiles) is None:
        raise HTTPException(status_code=422, detail="Invalid SMILES string")
    return report.generate_report(req.smiles, req.compound_name or "")


@app.post("/summarize")
def summarize(req: SummarizeRequest):
    """Grounded natural-language summary of a report produced by /analyze.

    Advisory layer: if the LLM is unconfigured/unreachable, returns
    {available: False, reason}. The deterministic /analyze numbers stand on
    their own and never depend on this endpoint.
    """
    import summary
    if not isinstance(req.report, dict) or "toxicity" not in req.report:
        raise HTTPException(status_code=422, detail="report must be an /analyze response object")
    return summary.generate_summary(req.report)


@app.post("/screen")
def screen(req: ScreenRequest):
    if not req.smiles_list:
        raise HTTPException(status_code=400, detail="smiles_list cannot be empty")

    smiles_capped = req.smiles_list[:100]  # hard cap
    valid_pairs = [(s, Chem.MolFromSmiles(s)) for s in smiles_capped]
    valid_pairs = [(s, m) for s, m in valid_pairs if m is not None]

    if not valid_pairs:
        raise HTTPException(status_code=422, detail="No valid SMILES strings provided")

    valid_smiles = [s for s, _ in valid_pairs]
    valid_mols   = [m for _, m in valid_pairs]
    probs = inference.batch_predict_probs(valid_smiles)
    risk_scores = (probs * _WEIGHT_ARRAY).sum(axis=1) / _WEIGHT_SUM

    results = []
    for i, (smiles, mol) in enumerate(valid_pairs):
        results.append({
            "smiles":        smiles,
            "risk_score":    round(float(risk_scores[i]), 4),
            "lipinski_pass": lipinski_pass(mol),
            "veber_pass":    veber_pass(mol),
            "pains_alerts":  get_pains_alerts(mol),
            **{t: round(float(probs[i, j]), 4) for j, t in enumerate(TARGET_NAMES)},
        })

    results.sort(key=lambda x: x["risk_score"])
    shortlist = results[:req.max_compounds]

    return {
        "results":        shortlist,
        "total_screened": len(valid_pairs),
        "shortlist_count": len(shortlist),
    }
