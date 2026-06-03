# Fine-Tuning Technical Specification — Tox21 Multi-Target Toxicity Model

**Date:** 2026-06-03
**Component:** `chemberta_tox21_multitarget.ipynb`
**Model artifact:** `mike-malloy/chemberta-tox21-multitarget-scaffold-<timestamp>` (HuggingFace Hub)
**Status:** Specification for the current re-training run (scaffold-split revision of the live V1 model)

---

## 1. Purpose and Scope

This document specifies how the toxicity model is fine-tuned: the base model, the task formulation, the data pipeline, the parameter-efficient adaptation strategy, the loss and class-imbalance handling, the evaluation protocol, and the reproducibility/governance practices that make the run auditable. It records not only *what* the settings are but *why* each was chosen, so the run can be defended, reproduced, and improved deliberately rather than by trial and error.

The scope is the multi-label Tox21 toxicity classifier that powers the platform's `/analyze` and `/screen` endpoints. ADMET descriptors (Lipinski, Veber, PAINS, physicochemical properties) are computed deterministically with RDKit and are explicitly *not* part of the learned model; they are out of scope here.

This revision changes exactly one design decision relative to the live V1 model — the train/validation/test split moves from random-stratified to Bemis–Murcko scaffold splitting. Everything else is held constant so the resulting change in measured performance is attributable to the split alone.

---

## 2. Base Model

The base model is `DeepChem/ChemBERTa-77M-MTR`, a RoBERTa-style transformer pre-trained by DeepChem on roughly 77 million SMILES strings from PubChem using a multi-task regression objective over molecular properties. It has 6 transformer layers, 600-dimensional hidden states, 12 attention heads, and a SMILES tokenizer with a vocabulary of 591 chemical-substring tokens.

ChemBERTa was chosen over training a molecular transformer from scratch because the pre-trained weights already encode a large amount of structural chemistry — substructure patterns, valence regularities, common scaffolds — learned from far more molecules than any toxicity dataset contains. Fine-tuning adapts that representation to the toxicity task rather than re-learning chemistry from ~7,800 labelled compounds, which would be infeasible. Training from scratch is an explicit non-goal of this project.

---

## 3. Task Formulation

The task is multi-label binary classification over the 12 Tox21 assay endpoints, predicted simultaneously from a single forward pass. The 12 targets, in fixed tensor order, are:

`NR-AR, NR-AR-LBD, NR-AhR, NR-Aromatase, NR-ER, NR-ER-LBD, NR-PPAR-gamma, SR-ARE, SR-ATAD5, SR-HSE, SR-MMP, SR-p53`.

A single 12-output linear classification head sits on top of the pooled ChemBERTa representation. Training all 12 targets jointly (rather than one model per target) lets the shared backbone learn toxic substructures that generalise across related assays — for example the two androgen-receptor endpoints (`NR-AR`, `NR-AR-LBD`) share signal — and it keeps inference to one model and one forward pass.

A critical feature of Tox21 is that not every compound is tested against every assay. Untested compound–assay pairs are encoded as `-1.0` and are masked out of the loss (see §6); they are neither positive nor negative and must not contribute gradient.

---

## 4. Dataset

The dataset is Tox21, accessed as `scikit-fingerprints/MoleculeNet_Tox21` via HuggingFace Datasets. It contains 7,831 compounds, each tested against some subset of the 12 nuclear-receptor and stress-response assays. Tox21 originates from the 2014 NIH/EPA/NCATS challenge and is a standard MoleculeNet benchmark, which makes published numbers available for comparison — provided the same split protocol is used (see §5).

The dataset is severely class-imbalanced. Positive (toxic) rates per target range from roughly 3% (`NR-AR`) to about 16% (`SR-MMP`). Without correction, a classifier minimising raw loss would learn to predict "non-toxic" for everything and still score well on accuracy. This drives both the loss weighting in §6 and the per-target threshold tuning in §8.

---

## 5. Data Splitting — Bemis–Murcko Scaffold Split (Key Decision)

**Decision:** Replace the previous random-stratified 70/15/15 split with a deterministic Bemis–Murcko scaffold split at the same 70/15/15 ratio.

**Why.** A random split places structurally near-identical molecules — molecules sharing a Bemis–Murcko scaffold, differing only by a substituent — on both sides of the train/test boundary. At test time the model is then rewarded for recognising near-twins of molecules it has already seen, so reported ROC-AUC is optimistic and says little about performance on novel chemistry, which is the only thing that matters in real discovery. Scaffold splitting groups molecules by their Bemis–Murcko scaffold and forces each whole scaffold entirely into one split, so the test set contains genuinely unfamiliar chemical series. The MoleculeNet/Tox21 leaderboard reports scaffold-split numbers; a random-split result is therefore not comparable to published work, whereas a scaffold-split result is.

**Algorithm.** For each molecule, compute its Bemis–Murcko scaffold SMILES with RDKit (`MurckoScaffold.MurckoScaffoldSmiles`, chirality excluded). Molecules that fail to parse, or that have no ring system and therefore no scaffold, are grouped under their own sentinel keys so they cannot silently merge. Scaffold groups are sorted largest-first (with a deterministic tie-break on first index) and assigned greedily to train until it reaches 70% of compounds, then to validation up to 85%, then the remainder to test. Largest-first assignment pushes rare and singleton scaffolds into validation and test by construction — exactly the novel-chemistry stress test we want. The procedure is fully deterministic, so the split is reproducible across runs without depending on a random seed.

**Trade-off we accept deliberately.** A pure scaffold split cannot simultaneously be stratified by label, so the per-split positive rate will drift relative to a stratified split — rare-target positives in particular may be unevenly distributed. This is a real cost and it is accepted on purpose: structural honesty is worth more than label balance for a benchmark whose entire point is generalisation. The notebook prints each split's size and "≥1 toxic label" rate so this drift is visible and auditable rather than hidden.

**Implementation note.** A self-contained RDKit implementation is used rather than DeepChem's `ScaffoldSplitter`, to avoid a heavy additional dependency and to keep the splitting mechanism legible in-notebook.

---

## 6. Parameter-Efficient Fine-Tuning — LoRA

Adaptation uses LoRA (Low-Rank Adaptation). LoRA freezes the pre-trained weights and injects small trainable low-rank matrices into selected attention projections; only those matrices and the new classification head are trained. This reduces trainable parameters from 3.66M to roughly 226K (about 6.2% of the total).

| LoRA parameter | Value | Rationale |
|---|---|---|
| Rank `r` | 16 | Found to perform comparably to `r=32` on validation with far fewer parameters. |
| Alpha | 32 | Standard 2:1 alpha-to-rank scaling. |
| Dropout | 0.1 | Light regularisation appropriate to a small dataset. |
| Target modules | `query`, `value` | Standard LoRA configuration for transformers; adapts attention without touching keys, FFN, or embeddings. |

LoRA is preferred over full fine-tuning for three reasons. The base model's chemical knowledge, learned from 77M molecules, should be preserved rather than overwritten. The Tox21 training set (~5,500 compounds after splitting) is tiny relative to the model, so full fine-tuning risks catastrophic forgetting. And the small trainable footprint makes iteration cheap on consumer hardware.

---

## 7. Loss and Class-Imbalance Handling

The loss is `BCEWithLogitsLoss` with two modifications essential to this dataset.

A **per-sample mask** zeros out every entry marked untested (`-1`) so those positions contribute no gradient. This is critical: treating "untested" as "non-toxic" would inject a large volume of false negatives and severely distort the learning signal.

**Per-target positive weighting** sets `pos_weight = n_negative / n_positive`, computed per target from the training split, and passes it to the loss. This up-weights the rare toxic class so the model learns to detect toxicity rather than collapsing to the majority "safe" prediction. Because the weights are computed from the training split, the scaffold split's altered class balance flows through automatically.

---

## 8. Decision Thresholds

Rather than a global 0.5 cut-off, each target's decision threshold is tuned independently on the **validation** split by sweeping 0.05 → 0.95 in 0.05 steps and selecting the value that maximises F1. Per-target thresholds matter because each assay has a different class balance and a different cost trade-off between false positives and false negatives. Thresholds are tuned on validation, never on test, to avoid leakage. The notebook flags any threshold that lands at the top of the search range, since that indicates the true optimum may be higher.

Because thresholds are tuned on the validation split, the scaffold-split revision produces a **new** threshold table; the previous V1 thresholds must not be reused with this model.

**Tuned thresholds (scaffold run, 2026-06-03).** No threshold reached the top of the search range, so the 0.05–0.95 sweep was sufficient.

| Target | Threshold | Val F1 | Recall | Precision |
|---|---|---|---|---|
| NR-AR | 0.90 | 0.537 | 0.407 | 0.786 |
| NR-AR-LBD | 0.75 | 0.444 | 0.414 | 0.480 |
| NR-AhR | 0.75 | 0.564 | 0.557 | 0.571 |
| NR-Aromatase | 0.75 | 0.279 | 0.442 | 0.204 |
| NR-ER | 0.70 | 0.347 | 0.321 | 0.379 |
| NR-ER-LBD | 0.75 | 0.274 | 0.400 | 0.208 |
| NR-PPAR-gamma | 0.80 | 0.337 | 0.424 | 0.280 |
| SR-ARE | 0.60 | 0.469 | 0.504 | 0.439 |
| SR-ATAD5 | 0.80 | 0.209 | 0.290 | 0.164 |
| SR-HSE | 0.65 | 0.316 | 0.429 | 0.250 |
| SR-MMP | 0.70 | 0.512 | 0.550 | 0.478 |
| SR-p53 | 0.70 | 0.357 | 0.500 | 0.278 |

**Operating-point note.** Validation F1 is modest (0.21–0.56) and precision is low on the rarest targets (NR-Aromatase, NR-ER-LBD, SR-ATAD5). This reflects the severe class imbalance rather than a training fault: at ~3% positive prevalence, F1-maximising tuning accepts many false positives to recover the few true positives. ROC-AUC (a ranking metric) is therefore the fairer headline; the F1/precision/recall figures are operating-point diagnostics. The threshold *objective* itself is a deliberate product lever — F1 (current), precision-weighted (fewer false alarms for a medicinal chemist), or recall-weighted (never miss a toxic compound for safety screening) — and should be chosen to match the intended use rather than defaulted.

---

## 9. Training Configuration

| Parameter | Value |
|---|---|
| Epochs | 10, early stopping patience 4 |
| Batch size | 32 |
| Optimizer | AdamW |
| Learning rate | 2×10⁻⁴ |
| LR scheduler | Cosine, 50-step warmup |
| Weight decay | 0.01 |
| Max sequence length | 128 tokens (<0.5% of SMILES truncated) |
| Best-checkpoint metric | Mean validation ROC-AUC |
| Seed | 42 |
| Hardware | Mac Mini (Apple Silicon, MPS backend) |

The best checkpoint is selected by mean ROC-AUC on the validation set with early stopping, so training stops when validation performance plateaus rather than running a fixed budget. Training runs on the Mac Mini via the MPS backend; the model is small enough (226K trainable parameters, ~5,500 training compounds) that this is the appropriate machine, and keeping the same hardware and environment as the prior run keeps the random-vs-scaffold comparison clean.

---

## 10. Evaluation

The primary metric is mean ROC-AUC across the 12 endpoints on the held-out **test** split, reported alongside per-target ROC-AUC. ROC-AUC is threshold-independent and tolerant of class imbalance, which makes it the right headline metric here; F1, recall, and precision at the tuned thresholds are reported as operating-point diagnostics.

**Results (scaffold run, 2026-06-03).** The scaffold-split model achieved a **mean test ROC-AUC of 0.7764**, down from the V1 random-split model's 0.8122 — a give-back of ~0.036. This modest drop is the expected and correct result, not a regression: it is the honest estimate of generalisation to novel chemical scaffolds and the figure comparable to the MoleculeNet leaderboard. The random-split number was optimistic because structurally similar molecules leaked across the train/test boundary; the scaffold number is the one to cite.

Per-target test ROC-AUC:

| Target | ROC-AUC | % toxic (test) |
|---|---|---|
| NR-AR | 0.7475 | 2.9% |
| NR-AR-LBD | 0.7276 | 2.3% |
| NR-AhR | 0.8745 | 7.8% |
| NR-Aromatase | 0.8454 | 4.3% |
| NR-ER | 0.6490 | 11.0% |
| NR-ER-LBD | 0.7301 | 4.3% |
| NR-PPAR-gamma | 0.7838 | 3.6% |
| SR-ARE | 0.7032 | 15.1% |
| SR-ATAD5 | 0.7921 | 3.5% |
| SR-HSE | 0.7509 | 5.7% |
| SR-MMP | 0.8753 | 10.9% |
| SR-p53 | 0.8380 | 6.2% |
| **Mean** | **0.7764** | — |

The strongest endpoints (SR-MMP, NR-AhR, both ~0.875) are also among the better-populated assays. The weakest is NR-ER at 0.649 — the only endpoint below 0.70 and a known-hard target (it was also weakest under the random split at 0.71); it is the natural candidate for targeted data augmentation in a follow-on version.

**Functional validation.** Beyond the aggregate metric, the model was sanity-checked on compounds with known biology. Aspirin and caffeine — true negatives across this panel — returned clean. The xenoestrogen bisphenol A and the steroid 17β-estradiol both flagged the estrogen-receptor endpoints (NR-ER, NR-ER-LBD) and aromatase with high probability (>0.88), confirming the model discriminates true actives on the biologically correct pathways rather than predicting a constant.

---

## 11. Reproducibility and Governance

Reproducibility is a first-class requirement of this project, and the run is instrumented accordingly.

Every run writes an `experiment_metadata.json` capturing the dataset, target list, model and LoRA configuration, training hyperparameters, the random seed, the resulting per-target and mean ROC-AUC, and the tuned thresholds. This revision adds an explicit `split_strategy: bemis_murcko_scaffold` field (with the 70/15/15 fractions and the scaffold count) so the artifact declares *how it was split* — previously only the seed was recorded, which was insufficient to reproduce or interpret the split.

Model versioning is handled by never overwriting a published model. `RUN_NAME` is timestamped and now carries a `-scaffold` tag, so this run publishes to a new HuggingFace repository and the existing V1 model remains intact. Both the random-split and scaffold-split models therefore persist as distinct, auditable artifacts, and the deployed application pins an explicit model revision rather than a floating "latest".

Experiment tracking runs through Weights & Biases.

---

## 12. Deployment Impact

The architecture (ChemBERTa backbone, LoRA config, 12-output head) and the input/output contract (SMILES in, 12 probabilities out) are unchanged, so no frontend or API changes are required. Three things do change and must be propagated: the model weights (a new HuggingFace repository), the per-target thresholds (backend configuration), and the displayed/cited metrics. Because the model is baked into the Docker image at build time, the backend image must be rebuilt and redeployed for the new weights to reach production.

---

## 13. Known Limitations and Planned Improvements

The dataset remains small (~7,800 compounds); the rarest targets have very few positive examples, which caps achievable recall regardless of architecture. Reported probabilities are raw sigmoid outputs and are **not calibrated** — calibration (e.g. temperature scaling) and an applicability-domain check (is a query molecule even in-distribution relative to training data?) are the next depth investments and are prerequisites for treating the probabilities as genuine confidence. SMILES enumeration augmentation, a focal-loss variant of the imbalance handling, and broadening the LoRA target modules are documented tuning levers for follow-on versions.

The sanctioned functional extension, pursued only if the project warrants it, is a set of clinically critical endpoints (Ames mutagenicity, hERG cardiotoxicity, DILI, LD50) added as additional heads on the same backbone. The AMR/DNA direction explored earlier is explicitly out of scope.
