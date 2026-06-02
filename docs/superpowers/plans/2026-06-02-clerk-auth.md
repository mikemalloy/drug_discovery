# Clerk Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk authentication to the drug discovery platform so only signed-in users can access the Analyzer and call the backend API.

**Architecture:** The frontend uses `@clerk/nextjs` with `<SignedIn>/<SignedOut>` conditional rendering — unauthenticated users see a landing page, authenticated users see the Analyzer. `Analyzer.tsx` fetches a Clerk JWT via `getToken()` and sends it as an `Authorization: Bearer` header. The FastAPI backend verifies every `/analyze` and `/screen` request using `fastapi-clerk-auth` and the Clerk JWKS URL. `/health` stays public for App Runner health checks.

**Tech Stack:** `@clerk/nextjs`, `fastapi-clerk-auth`, Terraform (App Runner runtime env vars), Next.js static export on S3.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/package.json` | Modify | Add `@clerk/nextjs` |
| `frontend/.env.local` | Modify | Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
| `frontend/.env.example` | Modify | Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` placeholder |
| `frontend/app/layout.tsx` | Modify | Wrap body in `<ClerkProvider>` |
| `frontend/app/page.tsx` | Modify | `<SignedOut><LandingPage /></SignedOut>` + `<SignedIn>` branch with `<UserButton>` |
| `frontend/components/LandingPage.tsx` | Create | Hero + 3 feature cards + `<SignInButton mode="modal">` |
| `frontend/components/Analyzer.tsx` | Modify | Add `useAuth()` → `getToken()` → `Authorization` header |
| `frontend/__tests__/LandingPage.test.tsx` | Create | Tests for LandingPage rendering |
| `frontend/__tests__/Analyzer.test.tsx` | Modify | Add `vi.mock('@clerk/nextjs')` + 2 new auth tests |
| `backend/requirements.txt` | Modify | Add `fastapi-clerk-auth` |
| `backend/server.py` | Modify | Add `ClerkConfig`, `ClerkHTTPBearer`, `Depends(clerk_guard)` on `/analyze` + `/screen` |
| `backend/tests/test_analyze.py` | Modify | Add `dependency_overrides[clerk_guard] = lambda: None` |
| `backend/tests/test_screen.py` | Modify | Add `dependency_overrides[clerk_guard] = lambda: None` |
| `backend/tests/test_auth.py` | Create | Verify 403 without token, 200 on `/health` |
| `terraform/variables.tf` | Modify | Add `clerk_jwks_url` variable |
| `terraform/main.tf` | Modify | Add `CLERK_JWKS_URL` to App Runner runtime env |
| `terraform/terraform.tfvars` | Create | Holds `clerk_jwks_url` value (gitignored) |
| `.gitignore` | Modify | Add `terraform/terraform.tfvars` |

---

## Task 1: Install @clerk/nextjs and configure env vars

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.env.local`
- Modify: `frontend/.env.example`

No automated tests for this task — it's pure configuration.

- [ ] **Step 1: Install @clerk/nextjs**

```bash
cd frontend
npm install @clerk/nextjs
```

Expected: `@clerk/nextjs` appears in `package.json` dependencies.

- [ ] **Step 2: Add publishable key to .env.local**

Get your Clerk Publishable Key from the Clerk dashboard → your app → **API Keys**. It starts with `pk_test_` (development) or `pk_live_` (production).

Open `frontend/.env.local` and add:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-key-here>
```

The file should now contain:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-key-here>
```

- [ ] **Step 3: Update .env.example**

Open `frontend/.env.example` and add the placeholder:
```
NEXT_PUBLIC_API_URL=https://<app-runner-url>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-clerk-publishable-key>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat(auth): install @clerk/nextjs"
```

Note: `.env.local` is gitignored and should NOT be committed.

---

## Task 2: Add ClerkProvider to layout.tsx

**Files:**
- Modify: `frontend/app/layout.tsx`

ClerkProvider must wrap the entire app tree so all child components can access auth state. No unit test needed — the Analyzer tests will exercise this once the mock is in place.

- [ ] **Step 1: Update layout.tsx**

Replace the full contents of `frontend/app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Drug Discovery Platform',
  description: 'AI-powered compound toxicity screening',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Verify build still compiles**

```bash
cd frontend
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(auth): add ClerkProvider to root layout"
```

---

## Task 3: Create LandingPage component (TDD)

**Files:**
- Create: `frontend/__tests__/LandingPage.test.tsx`
- Create: `frontend/components/LandingPage.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/__tests__/LandingPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import LandingPage from '@/components/LandingPage';

vi.mock('@clerk/nextjs', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LandingPage', () => {
  it('renders the app title', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('heading', { name: /Drug Discovery Platform/i })
    ).toBeInTheDocument();
  });

  it('renders a Sign In button', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('button', { name: /Sign In/i })
    ).toBeInTheDocument();
  });

  it('renders 12 Tox21 Endpoints feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/12 Tox21 Endpoints/i)).toBeInTheDocument();
  });

  it('renders ADMET Profiling feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/ADMET Profiling/i)).toBeInTheDocument();
  });

  it('renders Risk Scoring feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Risk Scoring/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend
npx vitest run __tests__/LandingPage.test.tsx
```

Expected: 5 failures — `Cannot find module '@/components/LandingPage'`.

- [ ] **Step 3: Create LandingPage.tsx**

Create `frontend/components/LandingPage.tsx`:

```tsx
'use client';

import { SignInButton } from '@clerk/nextjs';

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Drug Discovery Platform
        </h1>
        <p className="text-lg text-gray-500 mb-8">
          AI-powered compound toxicity screening
        </p>
        <SignInButton mode="modal">
          <button className="bg-blue-800 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-base transition-colors">
            Sign In to Get Started
          </button>
        </SignInButton>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">12 Tox21 Endpoints</h2>
          <p className="text-sm text-gray-500">
            Predicts toxicity across nuclear receptor and stress response pathways
            including NR-AR, NR-AhR, and SR-p53.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">ADMET Profiling</h2>
          <p className="text-sm text-gray-500">
            Computes Lipinski, Veber, and PAINS rules alongside molecular weight,
            LogP, TPSA, and rotatable bonds.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Risk Scoring &amp; Structure Visualization</h2>
          <p className="text-sm text-gray-500">
            Composite risk tier (Low / Moderate / High) with 2D molecular structure
            rendered from SMILES.
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend
npx vitest run __tests__/LandingPage.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/LandingPage.tsx frontend/__tests__/LandingPage.test.tsx
git commit -m "feat(auth): add LandingPage with hero and feature cards"
```

---

## Task 4: Update page.tsx with conditional rendering

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Update page.tsx**

Replace the full contents of `frontend/app/page.tsx` with:

```tsx
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import Analyzer from '@/components/Analyzer';
import LandingPage from '@/components/LandingPage';

export default function Home() {
  return (
    <>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <main className="flex-1 flex flex-col min-h-0">
          <header className="bg-blue-800 text-white px-6 py-4 flex-shrink-0 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Drug Discovery Platform</h1>
              <p className="text-sm text-blue-200 mt-0.5">
                AI-powered compound toxicity screening
              </p>
            </div>
            <UserButton />
          </header>
          <div className="flex-1 min-h-0">
            <Analyzer />
          </div>
        </main>
      </SignedIn>
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd frontend
npm run build
```

Expected: build succeeds, `out/` directory created.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/page.tsx
git commit -m "feat(auth): add SignedIn/SignedOut conditional rendering to page"
```

---

## Task 5: Add auth token to Analyzer.tsx (TDD)

**Files:**
- Modify: `frontend/components/Analyzer.tsx`
- Modify: `frontend/__tests__/Analyzer.test.tsx`

The `handleAnalyze` function must call `getToken()` before firing the fetch and include the token in `Authorization: Bearer` headers. If `getToken()` returns null, set error state.

- [ ] **Step 1: Add Clerk mock and new tests to Analyzer.test.tsx**

At the top of `frontend/__tests__/Analyzer.test.tsx`, add the mock import and `vi.mock` call immediately after the existing imports:

```tsx
import { useAuth } from '@clerk/nextjs';

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn().mockResolvedValue('test-token') })),
}));
```

Then add these two new tests inside the `describe('Analyzer', ...)` block, after the existing tests:

```tsx
  // ── Auth ─────────────────────────────────────────────────────────────

  it('shows auth error in both cards when getToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      getToken: vi.fn().mockResolvedValue(null),
    } as ReturnType<typeof useAuth>);
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(
      screen.getAllByText('Authentication required — please sign in.').length
    ).toBe(2);
  });

  it('sends Authorization header with fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STUB_REPORT,
    });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC(=O)Oc1ccccc1C(=O)O' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
```

- [ ] **Step 2: Run tests to confirm 2 new ones fail and 13 existing ones fail**

```bash
cd frontend
npx vitest run __tests__/Analyzer.test.tsx
```

Expected: 15 failures — `useAuth is not a function` or similar (Clerk not yet mocked in component).

- [ ] **Step 3: Update Analyzer.tsx**

In `frontend/components/Analyzer.tsx`, make these two changes:

**Change 1** — add `useAuth` import at the top (line 3, after existing imports):

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { AnalyzeResponse } from '@/types/report';
```

**Change 2** — add `getToken` to the component state declarations (after `const timersRef = ...` line) and update `handleAnalyze`:

Add this line after `const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);`:
```tsx
  const { getToken } = useAuth();
```

Replace the entire `handleAnalyze` function (lines 57–103) with:

```tsx
  const handleAnalyze = async () => {
    if (!smiles.trim() || status === 'loading') return;

    const token = await getToken();
    if (!token) {
      setStatus('error');
      setErrorMessage('Authentication required — please sign in.');
      return;
    }

    setStatus('loading');
    setStepIndex(0);
    setReport(null);
    setErrorMessage('');
    clearTimers();

    STEP_TIMINGS.forEach((delay, i) => {
      const t = setTimeout(() => setStepIndex(i + 1), delay);
      timersRef.current.push(t);
    });

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/analyze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ smiles: smiles.trim(), compound_name: compoundName }),
        }
      );

      clearTimers();

      if (response.status === 422) {
        setStatus('error');
        setErrorMessage('Invalid SMILES string — please check your input.');
        return;
      }
      if (!response.ok) {
        setStatus('error');
        setErrorMessage('Could not reach the analysis server.');
        return;
      }

      const data: AnalyzeResponse = await response.json();
      setReport(data);
      setStepIndex(STEPS.length - 1);
      setStatus('done');
    } catch {
      clearTimers();
      setStatus('error');
      setErrorMessage('Could not reach the analysis server.');
    }
  };
```

- [ ] **Step 4: Run all frontend tests to confirm 15/15 pass**

```bash
cd frontend
npx vitest run
```

Expected: 20 tests pass (5 LandingPage + 15 Analyzer).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/Analyzer.tsx frontend/__tests__/Analyzer.test.tsx
git commit -m "feat(auth): add Clerk token to Analyzer fetch"
```

---

## Task 6: Backend — add fastapi-clerk-auth (TDD)

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/server.py`
- Modify: `backend/tests/test_analyze.py`
- Modify: `backend/tests/test_screen.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 1: Write failing auth tests**

Create `backend/tests/test_auth.py`:

```python
# backend/tests/test_auth.py
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from unittest.mock import patch
from tests.conftest import ASPIRIN


def test_analyze_without_token_returns_403():
    from fastapi.testclient import TestClient
    from server import app
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
    from server import app
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend
pytest tests/test_auth.py -v
```

Expected: `ImportError: cannot import name 'clerk_guard' from 'server'` or similar.

- [ ] **Step 3: Add fastapi-clerk-auth to requirements.txt**

Open `backend/requirements.txt` and add `fastapi-clerk-auth` after the `fastapi` line:

```
torch --index-url https://download.pytorch.org/whl/cpu
transformers>=4.44.0
peft>=0.12.0
rdkit>=2024.3.5
captum>=0.7.0
fastapi>=0.115.0
fastapi-clerk-auth
uvicorn>=0.30.0
numpy>=1.26.0
matplotlib>=3.9.0
scipy>=1.13.0
httpx>=0.27.0
pytest>=8.0.0
```

Install locally so tests can run:

```bash
cd backend
pip install fastapi-clerk-auth
```

- [ ] **Step 4: Update server.py**

Replace the imports block and add `clerk_guard` in `backend/server.py`. The full updated file:

```python
# backend/server.py
import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer, HTTPAuthorizationCredentials
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

clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard  = ClerkHTTPBearer(clerk_config)

_WEIGHT_ARRAY = np.array([SEVERITY_WEIGHTS[t] for t in TARGET_NAMES])
_WEIGHT_SUM   = _WEIGHT_ARRAY.sum()


class AnalyzeRequest(BaseModel):
    smiles: str
    compound_name: Optional[str] = ""


class ScreenRequest(BaseModel):
    smiles_list: list[str]
    max_compounds: Optional[int] = 50


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_DIR, "device": DEVICE}


@app.post("/analyze")
def analyze(
    req: AnalyzeRequest,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    if Chem.MolFromSmiles(req.smiles) is None:
        raise HTTPException(status_code=422, detail="Invalid SMILES string")
    return report.generate_report(req.smiles, req.compound_name or "")


@app.post("/screen")
def screen(
    req: ScreenRequest,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
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
```

- [ ] **Step 5: Run auth tests to confirm they pass**

```bash
cd backend
pytest tests/test_auth.py -v
```

Expected: 3 tests pass — `test_analyze_without_token_returns_403`, `test_screen_without_token_returns_403`, `test_health_without_token_returns_200`.

- [ ] **Step 6: Update test_analyze.py to override clerk_guard**

Replace the `client` fixture in `backend/tests/test_analyze.py`:

```python
@pytest.fixture(scope='module')
def client():
    with patch('report.generate_report', return_value=STUB_REPORT), \
         patch('inference.batch_predict_probs'):
        from fastapi.testclient import TestClient
        from server import app, clerk_guard
        app.dependency_overrides[clerk_guard] = lambda: None
        yield TestClient(app)
        app.dependency_overrides.clear()
```

- [ ] **Step 7: Update test_screen.py to override clerk_guard**

Replace the `client` fixture in `backend/tests/test_screen.py`:

```python
@pytest.fixture(scope='module')
def client():
    with patch('report.generate_report'), \
         patch('inference.batch_predict_probs',
               return_value=np.array([[0.1] * 12])):
        from fastapi.testclient import TestClient
        from server import app, clerk_guard
        app.dependency_overrides[clerk_guard] = lambda: None
        yield TestClient(app)
        app.dependency_overrides.clear()
```

- [ ] **Step 8: Run all backend tests to confirm they pass**

```bash
cd backend
pytest -v
```

Expected: all existing tests pass plus the 3 new auth tests. If any existing test now gets 403, it means the fixture override is not being applied — check that the `yield` form is used (not `return`).

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/server.py \
        backend/tests/test_analyze.py backend/tests/test_screen.py \
        backend/tests/test_auth.py
git commit -m "feat(auth): add Clerk JWT verification to /analyze and /screen"
```

---

## Task 7: Infrastructure — Terraform updates

**Files:**
- Modify: `terraform/variables.tf`
- Modify: `terraform/main.tf`
- Create: `terraform/terraform.tfvars`
- Modify: `.gitignore`

- [ ] **Step 1: Add clerk_jwks_url to .gitignore**

Open `.gitignore` and add to the Terraform section:

```
# ── Terraform ─────────────────────────────────────────────────────────────────
.terraform/
terraform.tfstate
terraform.tfstate.backup
terraform/terraform.tfvars
*.tfplan
```

- [ ] **Step 2: Add clerk_jwks_url variable to variables.tf**

Open `terraform/variables.tf` and add at the end:

```hcl
variable "clerk_jwks_url" {
  description = "Clerk JWKS URL for backend JWT verification (from Clerk dashboard)"
  type        = string
}
```

- [ ] **Step 3: Add CLERK_JWKS_URL to App Runner runtime env in main.tf**

In `terraform/main.tf`, update the `runtime_environment_variables` block inside `aws_apprunner_service.backend`:

```hcl
        runtime_environment_variables = {
          PYTHONUNBUFFERED = "1"
          CLERK_JWKS_URL   = var.clerk_jwks_url
        }
```

- [ ] **Step 4: Create terraform.tfvars with the actual value**

Create `terraform/terraform.tfvars` (this file is gitignored):

```hcl
clerk_jwks_url = "https://neutral-ram-53.clerk.accounts.dev/.well-known/jwks.json"
```

This value comes from `CLERK_JWKS_URL` in your `.env` file.

- [ ] **Step 5: Verify terraform plan shows only the env var change**

```bash
cd terraform
terraform plan
```

Expected output includes:
```
~ update in-place
  ~ runtime_environment_variables = {
      + "CLERK_JWKS_URL"   = "https://neutral-ram-53.clerk.accounts.dev/.well-known/jwks.json"
        # (1 unchanged element hidden)
    }
```

No other changes. If you see unexpected destroys, stop and investigate before applying.

- [ ] **Step 6: Commit**

```bash
git add terraform/variables.tf terraform/main.tf .gitignore
git commit -m "feat(auth): add CLERK_JWKS_URL to App Runner runtime env"
```

---

## Task 8: Deploy backend

**Files:** none changed — deploys what was committed in Tasks 6 and 7.

- [ ] **Step 1: Rebuild and push the Docker image**

The image must be rebuilt because `requirements.txt` changed (added `fastapi-clerk-auth`).

```bash
cd /path/to/project
python scripts/build.py
```

Expected: ends with `Pushed: 724533161045.dkr.ecr.us-east-1.amazonaws.com/drug-discovery-backend:latest`

This takes 10–15 minutes (cross-platform `linux/amd64` build).

- [ ] **Step 2: Apply Terraform to update env vars and trigger redeployment**

```bash
cd terraform
terraform apply
```

Type `yes` when prompted. Terraform will:
1. Update the App Runner service config with `CLERK_JWKS_URL`
2. Trigger a new deployment (App Runner pulls the latest ECR image)

Expected: `Apply complete! Resources: 0 added, 1 changed, 0 destroyed.`

The App Runner redeployment takes 3–5 minutes. You can monitor it:

```bash
aws apprunner list-services --region us-east-1 --query 'ServiceSummaryList[0].Status' --output text
```

Wait until it shows `RUNNING`.

- [ ] **Step 3: Verify /health still works (no auth required)**

```bash
curl https://xs7bm7weqn.us-east-1.awsapprunner.com/health
```

Expected: `{"status":"ok","model":"mike-malloy/chemberta-tox21-multitarget","device":"cpu"}`

- [ ] **Step 4: Verify /analyze returns 403 without a token**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://xs7bm7weqn.us-east-1.awsapprunner.com/analyze \
  -H "Content-Type: application/json" \
  -d '{"smiles":"C"}'
```

Expected: `403`

---

## Task 9: Deploy frontend

**Files:** none changed — deploys what was committed in Tasks 2–5.

- [ ] **Step 1: Build with production env vars**

You need your Clerk Publishable Key (from the Clerk dashboard, same value you put in `.env.local`).

```bash
cd frontend
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<your-key> \
NEXT_PUBLIC_API_URL=https://xs7bm7weqn.us-east-1.awsapprunner.com \
npm run build
```

Expected: build succeeds, `out/` directory created.

- [ ] **Step 2: Sync to S3**

```bash
aws s3 sync out s3://drug-discovery-frontend-3f0fe77e --delete --region us-east-1
```

Expected: all files uploaded.

- [ ] **Step 3: Smoke test the live app**

Open `http://drug-discovery-frontend-3f0fe77e.s3-website-us-east-1.amazonaws.com` in a browser.

Verify:
- [ ] Unauthenticated: landing page with hero and three feature cards is visible
- [ ] "Sign In to Get Started" button opens Clerk modal
- [ ] After signing in: blue header with app name + `<UserButton>` appears
- [ ] Analyzer loads and runs a query with a valid SMILES (e.g. `CC(=O)Oc1ccccc1C(=O)O`)
- [ ] Result cards populate correctly
