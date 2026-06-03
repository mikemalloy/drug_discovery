# Drug Discovery Platform — Product Roadmap & Model Briefing
**Date:** 2026-06-02  
**Status:** V1 live on Railway + Vercel. Ready for V2 model fine-tuning.

---

## Part 1: V1 Toxicity Model (What We Have Now)

### Architecture
- **Base model:** `DeepChem/ChemBERTa-77M-MTR` — a RoBERTa-style transformer pretrained on 77M SMILES strings using masked language modeling with molecular property regression heads
- **Adaptation:** LoRA (Low-Rank Adaptation) added on top of frozen ChemBERTa weights
- **Task:** Multi-label binary classification — 12 toxicity endpoints simultaneously

### Training Data
- **Dataset:** `scikit-fingerprints/MoleculeNet_Tox21` via HuggingFace Datasets
- **Size:** 7,831 compounds (train/val/test split: 80/10/10)
- **Source:** Tox21 Challenge 2014 — NIH/EPA/NCATS collaboration
- **Class imbalance:** Severe — positive rates range from 2.9% (NR-AR) to 16.2% (SR-MMP)
- **Mitigation:** Per-target positive weights in BCE loss + per-target threshold tuning

### Hyperparameters
| Parameter | Value |
|-----------|-------|
| BASE_MODEL | DeepChem/ChemBERTa-77M-MTR |
| LORA_R | 16 |
| LORA_ALPHA | 32 |
| LORA_DROPOUT | 0.1 |
| TARGET_MODULES | ["query", "value"] |
| EPOCHS | 10 (early stopping patience=4) |
| BATCH_SIZE | 32 |
| LEARNING_RATE | 2e-4 |
| WEIGHT_DECAY | 0.01 |
| WARMUP_STEPS | 50 |
| LR_SCHEDULER | cosine |
| MAX_SEQ_LENGTH | 128 |
| Trainable params | ~226K / 3.66M (6.18%) |

### Per-Target Thresholds (tuned on validation set)
| Target | Threshold | Biological Significance |
|--------|-----------|------------------------|
| NR-AR | 0.95 | Androgen receptor — endocrine disruption |
| NR-AR-LBD | 0.95 | Androgen receptor ligand binding domain |
| NR-AhR | 0.75 | Aryl hydrocarbon receptor — dioxin pathway |
| NR-Aromatase | 0.85 | Estrogen synthesis enzyme |
| NR-ER | 0.70 | Estrogen receptor |
| NR-ER-LBD | 0.85 | Estrogen receptor LBD |
| NR-PPAR-gamma | 0.85 | Metabolic/adipogenic receptor |
| SR-ARE | 0.65 | Oxidative stress response |
| SR-ATAD5 | 0.80 | DNA damage / genotoxicity |
| SR-HSE | 0.85 | Heat shock / proteotoxic stress |
| SR-MMP | 0.85 | Mitochondrial membrane potential |
| SR-p53 | 0.85 | p53 tumor suppressor activation |

### Performance
- **Mean ROC-AUC:** 0.8122 on held-out test set
- Published to HuggingFace: `mike-malloy/chemberta-tox21-multitarget`

### Known Limitations & Potential Improvements
1. **Small dataset (7,831 compounds):** Tox21 is a well-curated benchmark but small. ChEMBL has millions of bioassay records.
2. **No ADMET prediction from the model:** MW, LogP, TPSA computed with RDKit rules — not learned from data.
3. **Missing clinically critical endpoints:**
   - **Ames mutagenicity** (the gold-standard genotoxicity assay; ~6,500 compounds in TDC)
   - **hERG cardiotoxicity** (cardiac ion channel; major drug attrition cause; ~13,000 in TDC)
   - **DILI** (drug-induced liver injury; ~475 in TDC — small but very high value)
   - **LD50** (acute oral toxicity; ~7,400 in TDC)
4. **LoRA target modules:** Only `query` and `value` — could add `key`, `dense` for more capacity
5. **Threshold strategy:** Currently maximize F1 per target. Could optimize for precision (fewer false positives for drug researchers) or recall (never miss a toxic compound for safety screening).

---

## Part 2: Extended Toxicity Model (V2 — Today's Fine-Tuning)

### Goal
Add 4 new classification heads on top of the existing ChemBERTa-LoRA backbone:
- Ames mutagenicity
- hERG cardiotoxicity  
- DILI
- LD50 (discretized: low/medium/high acute toxicity)

### Approach: Multi-Task Transfer Learning
The ChemBERTa backbone + LoRA adapters are already trained. We freeze nothing and continue training with a combined loss across all 16 heads. The new TDC datasets are small enough that the backbone won't overfit — LoRA keeps the parameter count low.

### Data Sources (TDC — Therapeutics Data Commons)
```python
from tdc.single_pred import Tox
ames = Tox(name='AMES')          # ~6,512 compounds, binary
herg = Tox(name='hERG')          # ~13,445 compounds, binary  
dili = Tox(name='DILI')          # ~475 compounds, binary
ld50 = Tox(name='LD50_Zhu')      # ~7,385 compounds, regression → discretize
```

### Training Estimate (Google Colab A100)
- Dataset size: ~35K combined compounds
- Epochs: 5-8 with early stopping
- Batch size: 32
- Estimated runtime: **4-6 hours on A100**
- Colab A100 cost: ~$1.15/hour = **$5-7 total**
- Colab Pro/Pro+ A100 access: available in Pro+ (~$50/month) or pay-as-you-go compute units

---

## Part 3: AMR (Anti-Microbial Resistance) DNA Model — New Capability

### The Opportunity
Antimicrobial resistance is a WHO top-10 global health threat. Drug-resistant bacteria kill ~1.27M people/year directly. There is no good open tool for researchers to screen compounds against resistance genes — a clear gap.

### What We Would Build
A model that takes a **DNA sequence** (resistance gene or bacterial genome fragment) and predicts:
1. Which resistance mechanism it belongs to (efflux pump, beta-lactamase, target modification, etc.)
2. Which antibiotic classes it confers resistance to
3. A confidence score

### Base Model Options
| Model | Params | Best For | HuggingFace ID |
|-------|--------|----------|----------------|
| **Nucleotide Transformer 2.5B** | 2.5B | Long genomic sequences, best accuracy | `InstaDeepAI/nucleotide-transformer-2.5b-multi-species` |
| **Nucleotide Transformer 500M** | 500M | Balanced — recommended for V1 | `InstaDeepAI/nucleotide-transformer-v2-500m-multi-species` |
| **ESM2 (650M)** | 650M | Protein sequences (resistance proteins) | `facebook/esm2_t33_650M_UR50D` |
| **DNABERT-2** | 117M | Shorter sequences, fastest training | `zhihan1996/DNABERT-2-117M` |

**Recommendation:** Start with **Nucleotide Transformer 500M** for DNA resistance genes. ESM2 is better if you pivot to protein sequences.

### Training Data
- **CARD (Comprehensive Antibiotic Resistance Database):** `https://card.mcmaster.ca/download`
  - 6,194 reference sequences (AMR genes)
  - Ontology: resistance mechanism, drug class, gene family
  - Download: `card-data.tar.bz2` (~50MB)
- **PATRIC database:** Clinical isolate genomes with resistance phenotypes
- **NCBI AMRFinderPlus database:** Used for clinical validation

### Training Approach
1. Download CARD canonical sequences (DNA or protein)
2. Parse ontology to create multi-label targets (one per antibiotic class: beta-lactam, fluoroquinolone, aminoglycoside, etc. — ~20 classes)
3. Fine-tune Nucleotide Transformer 500M with LoRA (same approach as ChemBERTa)
4. Publish to HuggingFace: `mike-malloy/amr-nt500m-card`

### Training Estimate (Google Colab A100)
- Dataset: ~6,200 sequences × augmentation = ~25K training examples
- Sequence length: 500-2000 bp (DNA resistance genes)
- Epochs: 10-15
- Estimated runtime: **6-10 hours on A100**
- Colab cost: **$7-12 on A100**

### Integration into Existing Platform
- New `/amr` API endpoint in FastAPI backend
- Input: raw DNA sequence (FASTA or plain)
- Output: resistance profile JSON (same pattern as toxicity output)
- Frontend: new tab alongside "Toxicity Analysis" — "AMR Screening"

---

## Part 4: Combined Report — The Key Differentiator

### The Concept
After both models run (toxicity for small molecules, AMR for DNA), a foundation model (Claude claude-haiku-4-5 or Claude claude-sonnet-4-6 via API) synthesizes a **written clinical interpretation report** that a medicinal chemist or microbiologist can actually use.

### What the Report Contains
```
COMPOUND ASSESSMENT REPORT
Generated: 2026-06-02

Compound: Ciprofloxacin (CIP)
SMILES: OC(=O)c1cn(C2CC2)c2cc(N3CCNCC3)c(F)cc2c1=O

EXECUTIVE SUMMARY
Ciprofloxacin shows a favorable safety profile across Tox21 endpoints with 
2/12 toxicity flags (SR-ARE, SR-MMP at moderate probability). ADMET properties 
meet Lipinski criteria. Ames and hERG assays predicted negative.

TOXICITY PROFILE
...detailed per-endpoint interpretation...

AMR CONTEXT (if DNA sequence provided)
The target organism carries gyrA mutations conferring fluoroquinolone 
resistance. The NorA efflux pump gene (CARD: ARO:0000001) is present. 
Clinical efficacy of ciprofloxacin against this isolate is predicted to 
be compromised.

RECOMMENDATION
Consider alternative antibiotic class (carbapenem, colistin) or combination 
therapy. The toxicity profile supports higher dosing if needed.
```

### Why This Matters to Pharma
1. **Speed:** Replaces 2-3 days of manual literature review per compound
2. **Integration:** Toxicity + AMR resistance in one report — no current tool does this
3. **Actionable:** Not just scores — a recommendation a researcher can act on
4. **Auditable:** All scores and thresholds are shown alongside the interpretation

### Implementation Plan
```python
# backend/report.py addition
async def generate_written_report(toxicity, admet, amr_profile, compound_name):
    client = anthropic.AsyncAnthropic()
    prompt = build_report_prompt(toxicity, admet, amr_profile, compound_name)
    
    # Stream via SSE to frontend
    async with client.messages.stream(
        model="claude-haiku-4-5-20251001",  # Fast + cheap for reports
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        async for text in stream.text_stream:
            yield text
```

API cost: ~$0.003 per report (claude-haiku-4-5 at 1K tokens output) — negligible.

---

## Part 5: Today's Action Items

### Step 1: Verify Colab Account Funds
- Go to console.cloud.google.com → Billing → check balance
- A100 40GB is ~$1.15/hr on Colab pay-as-you-go
- Budget needed: **$20-25** to cover both runs with buffer
- Alternative: Colab Pro+ ($50/month) gives priority A100 access with no per-hour billing

### Step 2: Run the Extended Toxicity Notebook
File: `notebooks/tox21_extended_finetune.ipynb` (created alongside this doc)
- Loads existing `mike-malloy/chemberta-tox21-multitarget` weights
- Adds Ames + hERG + DILI + LD50 heads
- Trains ~4-6 hours on A100
- Saves and pushes new model to HuggingFace

### Step 3: Run the AMR Notebook
File: `notebooks/amr_nucleotide_finetune.ipynb` (created alongside this doc)
- Downloads CARD database
- Fine-tunes Nucleotide Transformer 500M with LoRA
- Trains ~6-10 hours on A100
- Saves and pushes to HuggingFace

### Step 4 (Future — Next Session): Integration
- Update `backend/inference.py` with new toxicity heads
- Add `backend/amr_inference.py`
- Add `/amr` endpoint to `backend/server.py`
- Update frontend to show new endpoints + AMR tab
- Add Claude API streaming report generation

---

## Cost Summary

| Task | Runtime | A100 Cost |
|------|---------|-----------|
| Extended Toxicity (V2) | 4-6 hrs | $5-7 |
| AMR Model (V1) | 6-10 hrs | $7-12 |
| **Total** | **10-16 hrs** | **$12-19** |

Both runs can be queued back-to-back overnight. Use Colab's "background execution" in Pro+ to avoid session timeouts.
