# Drug Discovery AI Platform — Design Spec
**Date:** 2026-06-01  
**Status:** Approved  
**Approach:** Research-first, one phase at a time, test-driven development

---

## Purpose

Build a production-grade AI drug discovery platform as a portfolio project to demonstrate to pharmaceutical company managers that a software engineer can design, build, and deploy ML systems useful in real drug discovery workflows.

The project progresses from research notebooks through a production API and web interface, backed by AWS infrastructure managed with Terraform. Infrastructure is fully reproducible — spin up for a demo, tear down to save cost.

---

## Project Phases

| Phase | Milestone | Description |
|-------|-----------|-------------|
| 1 | M4 | Virtual screening pipeline notebook |
| 2 | M1.5 | Single-compound ADMET summary report notebook + JSON output function |
| 3 | Backend | FastAPI + Uvicorn containerized service |
| 4 | Frontend | Next.js UI (spec TBD from user) |
| 5 | Infra | Terraform + automation scripts |

Each phase is completed and validated before the next begins. Production code phases (3–5) follow strict TDD.

---

## Phase 1: Milestone 4 — Virtual Screening Notebook

### Goal
Demonstrate that the trained multi-target toxicity model can screen a large compound library and rank candidates by safety profile — the core use case in early drug discovery.

### Inputs
- A compound library: ~5,000 SMILES strings from ZINC-250k (free, drug-like subset)
- Trained M2 checkpoint (`chemberta-tox21-multitarget-*`)
- Optimized per-target thresholds from M2

### Pipeline Steps
1. **Load library** — download/cache ZINC-250k subset, parse SMILES, validate with RDKit (drop unparseable)
2. **Batch inference** — tokenize and score in chunks of 64; collect 12-target probability vectors
3. **Apply thresholds** — binary pass/fail per target using M2 optimized thresholds
4. **Composite risk score** — weighted sum of probabilities; targets weighted by severity:
   - High weight (1.5×): `SR-p53`, `SR-MMP`, `NR-AhR`
   - Standard weight (1.0×): all others
   - Score normalized to [0, 1]; lower = safer
5. **Drug-likeness filter** — Lipinski Rule of 5 + Veber rules via RDKit; flag violators (do not hard-drop)
6. **PAINS filter** — structural alert check via RDKit FilterCatalog; flag hits
7. **Rank and shortlist** — sort by composite risk score; present top-50 safest compounds
8. **Visualize** — 2D structure grid of top-10 compounds; histogram of risk score distribution; per-target pass rate bar chart
9. **Export** — save full results as `screening_results.csv` in project root

### Validation Cells (notebook assertions)
- Assert library loads with ≥ 4,500 valid SMILES after RDKit parse
- Assert output DataFrame has expected columns and no NaN probabilities
- Assert composite scores are in [0, 1]
- Assert top-50 shortlist contains no compounds failing all 12 targets
- Spot-check: aspirin and caffeine appear in the low-risk band

### Output
- `screening_results.csv` with columns: `smiles`, `name`, `risk_score`, `lipinski_pass`, `pains_flag`, and one column per target probability
- Ranked top-50 shortlist display in notebook

---

## Phase 2: Milestone 1.5 — Summary Report

### Goal
For a single compound, generate a comprehensive structured safety and drug-likeness profile. This notebook defines the exact data contract for the production API response.

### Core Function
```python
def generate_report(smiles: str, compound_name: str = "") -> dict:
    """
    Returns a structured report dict for a single compound.
    This function is the source of truth for the API response schema.
    """
```

### Report Schema
```json
{
  "smiles": "string",
  "canonical_smiles": "string",
  "compound_name": "string",
  "structure_svg": "string (SVG)",
  "toxicity": {
    "NR-AR":        { "probability": 0.172, "label": "safe", "threshold": 0.95 },
    "NR-AR-LBD":    { "probability": 0.128, "label": "safe", "threshold": 0.95 },
    "...": "..."
  },
  "admet": {
    "molecular_weight": 180.16,
    "logp": 1.19,
    "hbd": 1,
    "hba": 3,
    "tpsa": 63.6,
    "rotatable_bonds": 3,
    "lipinski_pass": true,
    "veber_pass": true,
    "pains_alerts": []
  },
  "explainability": {
    "NR-ER": {
      "atom_scores": { "0": 0.12, "1": 0.45, "...": "..." },
      "top_atoms": [1, 4, 7]
    }
  },
  "risk_summary": {
    "composite_score": 0.14,
    "tier": "Low",
    "toxic_targets": [],
    "flagged_targets": []
  }
}
```

### Notebook Contents
1. Implement and document `generate_report()`
2. Run on all 5 reference molecules (Aspirin, Tamoxifen, Bisphenol A, Dioxin, Caffeine)
3. Render rich HTML report for each (portfolio display)
4. Export one report as `sample_report.json` — this becomes the API contract fixture

### Validation Cells
- Assert `generate_report()` returns all required top-level keys
- Assert `toxicity` dict has exactly 12 targets
- Assert `admet.lipinski_pass` is correct for known compounds (Aspirin = True, large MW violators = False)
- Assert `risk_summary.tier` is one of `["Low", "Moderate", "High"]`
- Assert `structure_svg` is a non-empty string containing `<svg`

---

## Phase 3: Backend — FastAPI + App Runner

### Why App Runner (not Lambda)
The ML model (~300MB checkpoint) takes 15-20 seconds to load from disk. Lambda cold starts would add this to every request after idle periods, creating a poor demo experience. App Runner keeps the container warm — model loads once at startup and stays in memory. Cost is ~$5-10/month when running, $0 when destroyed via `terraform destroy`.

### Architecture
- **FastAPI** application (`backend/server.py`) — handles routing, validation, CORS
- **Uvicorn** server — no adapter needed, standard Python ASGI serving
- Model loaded once at startup into a module-level singleton
- Containerized via Docker, image pushed to ECR, served via App Runner
- No database — stateless request/response

### Endpoints

#### `POST /analyze`
- **Input:** `{ "smiles": "string", "compound_name": "string" }`
- **Output:** Full summary report JSON (matches Phase 2 schema exactly)
- **Errors:** 422 if SMILES unparseable by RDKit; 400 for missing input

#### `POST /screen`
- **Input:** `{ "smiles_list": ["string", ...], "max_compounds": 100 }`
- **Output:** `{ "results": [...ranked shortlist rows...], "total_screened": N, "shortlist_count": M }`
- **Limit:** max 500 compounds per request

#### `GET /health`
- **Output:** `{ "status": "ok", "model": "chemberta-tox21-multitarget-*", "device": "cpu" }`

### TDD Approach
- Write tests first using `pytest` + `httpx.AsyncClient` (FastAPI test client)
- One test file per endpoint: `test_analyze.py`, `test_screen.py`, `test_health.py`
- Test fixtures use `sample_report.json` from Phase 2 as the expected shape
- Tests cover: happy path, invalid SMILES, empty input, oversized batch, CORS headers

### Docker Image
- Base: `python:3.12-slim`
- CPU-only PyTorch (saves ~800MB vs GPU build)
- Dependencies: torch, transformers, peft, rdkit, captum, fastapi, uvicorn
- Model checkpoint copied into image at build time
- Total image size target: < 5GB

---

## Phase 4: Frontend — Next.js

**Design spec deferred** — user will provide a detailed UI spec.

Assumed constraints (from twin pattern):
- Next.js App Router, TypeScript, Tailwind CSS
- Static export to S3 (no SSR server required)
- Calls App Runner HTTPS endpoint directly from the browser
- Two primary views: single-compound analysis and batch screening

---

## Phase 5: Infrastructure — Terraform + Automation

### Terraform Resources
| Resource | Config |
|----------|--------|
| ECR | Container registry for backend Docker image |
| App Runner | Pulls from ECR, HTTPS endpoint, 2 vCPU / 4GB RAM, auto-scaling min 1 max 3 |
| S3 (frontend) | Static website hosting, public read |
| IAM | App Runner ECR access role; least-privilege |
| GitHub OIDC | CI/CD deployment without stored credentials |

### Cost Model
- **Demo running:** ~$0.10-0.15/hour (App Runner smallest instance)
- **Idle (image in ECR only):** <$0.10/month storage
- **Fully destroyed:** $0 — `terraform destroy` removes all billable resources

### Automation Scripts
- `scripts/build.py` — builds Docker image, pushes to ECR
- `scripts/deploy.py` — runs `terraform apply`, triggers App Runner redeployment, syncs frontend to S3
- `scripts/destroy.py` — runs `terraform destroy` for clean teardown
- `scripts/test_api.sh` — smoke tests against live App Runner URL

### TDD Approach for Scripts
- `build.py` has unit tests: assert Dockerfile exists, assert image tags are well-formed
- `deploy.py` tested with mocked boto3 calls
- `test_api.sh` is the integration test suite run post-deploy

---

## Testing Strategy Summary

| Phase | Test Type | Tool |
|-------|-----------|------|
| M4 notebook | Assertion cells | Python assert |
| M1.5 notebook | Assertion cells + schema validation | Python assert + jsonschema |
| Backend | Unit + integration | pytest + httpx |
| Frontend | Component + E2E | Vitest + Playwright (per UI spec) |
| Infra scripts | Unit | pytest + mocked boto3 |
| End-to-end | Smoke test | scripts/test_api.sh |

---

## Reference Architecture
- Backend/frontend pattern: `/Volumes/Hub/Dev/rag/Production/projects/twin/`
- Terraform pattern: `/Volumes/Hub/Dev/rag/Production/projects/twin/terraform/`

---

## Out of Scope
- Authentication / user accounts
- Persistent storage of past analyses
- GPU inference (CPU-only container)
- Custom domain / CloudFront
- Generative molecule design
- Active learning loop
