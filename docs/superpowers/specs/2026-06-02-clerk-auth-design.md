# Clerk Authentication — Design Spec
**Date:** 2026-06-02
**Status:** Approved
**Phase:** 5 — Authentication

---

## Purpose

Add Clerk authentication to the drug discovery platform to prevent unauthorized API usage. Any signed-in Clerk user gets full access. The enforcement model has two layers: client-side UI gating (hides the Analyzer from unauthenticated users) and backend JWT verification (rejects requests without a valid Clerk token regardless of how they were made).

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth provider | Clerk | Already in use on sibling saas project; keys already provisioned |
| Route structure | Single route, conditional render | Static export has no server middleware; `<SignedIn>/<SignedOut>` is sufficient for a portfolio demo |
| Sign-in UX | Modal (`mode="modal"`) | No separate `/sign-in` route needed; matches saas project pattern |
| Enforcement | Client-side UI gate + backend JWT verification | UI gate stops casual bots; JWT verification is the real enforcement layer |
| Protected endpoints | `/analyze`, `/screen` | `/health` stays public — App Runner health checks require it |
| Test auth override | `app.dependency_overrides[clerk_guard]` | Standard FastAPI pattern for dependency injection in tests |

---

## Architecture

```
Browser (unauthenticated)          Browser (authenticated)
        │                                   │
   <LandingPage />                  <header + Analyzer />
   <SignInButton modal>             <UserButton /> in header
        │                                   │
        │         Clerk modal sign-in       │
        │ ─────────────────────────────────>│
                                            │
                              getToken() → JWT
                                            │
                              POST /analyze
                              Authorization: Bearer <jwt>
                                            │
                                     App Runner
                                     FastAPI backend
                                            │
                              Depends(clerk_guard)
                              validates JWT via JWKS
                                            │
                              200 OK + report
```

---

## File Changes

### Frontend

| File | Change |
|------|--------|
| `frontend/app/layout.tsx` | Wrap body in `<ClerkProvider>` |
| `frontend/app/page.tsx` | Add `<SignedOut><LandingPage /></SignedOut>` and `<SignedIn>` branch with `<UserButton />` in header |
| `frontend/components/LandingPage.tsx` | New — hero + 3 feature cards + `<SignInButton mode="modal">` |
| `frontend/components/Analyzer.tsx` | Add `useAuth()` → `getToken()` → `Authorization: Bearer` header on fetch |
| `frontend/.env.local` | Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `frontend/.env.example` | Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` placeholder |

### Backend

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add `fastapi-clerk-auth` |
| `backend/server.py` | Add `ClerkConfig`, `ClerkHTTPBearer`, `Depends(clerk_guard)` on `/analyze` and `/screen` |
| `backend/tests/test_analyze.py` | Add `app.dependency_overrides[clerk_guard] = lambda: None` |
| `backend/tests/test_screen.py` | Add `app.dependency_overrides[clerk_guard] = lambda: None` |

### Infrastructure

| File | Change |
|------|--------|
| `terraform/main.tf` | Add `CLERK_JWKS_URL = var.clerk_jwks_url` to App Runner `runtime_environment_variables` |
| `terraform/variables.tf` | Add `clerk_jwks_url` variable (no default, required) |
| `terraform/terraform.tfvars` | New (gitignored) — holds `clerk_jwks_url` value |
| `.gitignore` | Add `terraform/terraform.tfvars` |

---

## Component: `LandingPage.tsx`

Clinical white/blue theme consistent with the rest of the app.

```
┌──────────────────────────────────────────────┐
│                                              │
│        Drug Discovery Platform               │
│   AI-powered compound toxicity screening     │
│                                              │
│         [ Sign In to Get Started ]           │
│                                              │
├──────────────┬──────────────┬───────────────┤
│  12 Tox21    │    ADMET     │  Risk Scoring │
│  Endpoints   │  Profiling   │  & Structure  │
│              │              │  Visualization│
│  NR-AR,      │  Lipinski,   │  Composite    │
│  NR-AhR,     │  Veber,      │  risk tier,   │
│  SR-p53...   │  PAINS       │  2D SVG       │
└──────────────┴──────────────┴───────────────┘
```

---

## Component: `Analyzer.tsx` — Auth Change

`handleAnalyze()` adds one step before the fetch:

```typescript
const { getToken } = useAuth();

// inside handleAnalyze, before fetch:
const token = await getToken();
if (!token) {
  setStatus('error');
  setErrorMessage('Authentication required');
  return;
}

// fetch headers:
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
}
```

---

## Backend: `server.py` — Auth Change

```python
import os
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer, HTTPAuthorizationCredentials

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard  = ClerkHTTPBearer(clerk_config)

@app.post("/analyze")
def analyze(
    req: AnalyzeRequest,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    ...

@app.post("/screen")
def screen(
    req: ScreenRequest,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    ...
```

`/health` is unchanged — no `Depends(clerk_guard)`.

---

## Test Auth Override

```python
# In conftest.py or at top of test_analyze.py / test_screen.py:
from backend.server import app, clerk_guard

app.dependency_overrides[clerk_guard] = lambda: None
```

---

## Environment Variables

| Variable | Scope | Where set |
|----------|-------|-----------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend build | `frontend/.env.local` (dev); env var at `npm run build` time (prod) |
| `CLERK_JWKS_URL` | Backend runtime | `terraform/terraform.tfvars` → App Runner env via Terraform |
| `CLERK_SECRET_KEY` | Not used | Already in `.env` — not needed; backend only requires JWKS URL for JWT verification |

---

## Deployment Flow

### Backend (when `server.py` or `requirements.txt` change)
1. Rebuild Docker image: `python scripts/build.py`
2. Trigger App Runner redeploy: `aws apprunner start-deployment --service-arn <arn>`
3. Apply Terraform if `main.tf` changed: `terraform apply` (picks up `CLERK_JWKS_URL`)

### Frontend (when frontend files change)
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... \
NEXT_PUBLIC_API_URL=https://xs7bm7weqn.us-east-1.awsapprunner.com \
npm run build

aws s3 sync out s3://drug-discovery-frontend-3f0fe77e --delete --region us-east-1
```

---

## Out of Scope

- Subscription / plan gating (auth-only, any signed-in user has full access)
- User activity logging or per-user rate limiting
- Clerk webhooks
- Sign-up flow customization (Clerk hosted UI handles this)
