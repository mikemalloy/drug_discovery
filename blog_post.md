# I fine-tuned a molecular transformer to predict drug toxicity. Here's what that actually involved.

For the past several months, I've been learning AI engineering seriously — working through transformers, fine-tuning workflows, embeddings, and the infrastructure that turns a trained model into something people can actually use. At some point you need a real project to pull it all together. After looking into how AI is being applied in drug discovery, I settled on building a toxicity prediction system.

The goal wasn't to discover new drugs. I want to be clear about that. This was an engineering project, not a research one. What I wanted was a problem that would force me to work through fine-tuning end to end — with real data, real class imbalance problems, and real decisions about model architecture. Then build something around it that a person could actually interact with.

Here's what that looked like.

---

## The problem

Drug candidates fail for a lot of reasons, but toxicity is one of the most expensive. Catching it late — after significant investment in a compound — is a known industry problem. The Tox21 benchmark dataset was assembled specifically to help address this: 7,831 compounds, each tested across 12 biological assays measuring different mechanisms of harm. Androgen receptor disruption. Mitochondrial toxicity. DNA damage signaling. Each compound gets a binary label per assay: toxic or not.

The dataset has some real messiness to it. Only 3–17% of compounds are positive for toxicity per assay, depending on the target. And roughly 30% of entries are "untested" — that compound simply wasn't run through that particular assay. Both of those facts turned out to matter quite a bit for training.

---

## The model

I used ChemBERTa-77M-MTR, a RoBERTa-style transformer pre-trained by DeepChem on 77 million SMILES strings from PubChem. SMILES is the notation chemists use to represent molecular structure as text — aspirin is `CC(=O)Oc1ccccc1C(=O)O`. The model already understands chemistry; my job was to adapt it to predict toxicity across these 12 targets.

The fine-tuning approach was LoRA — Low-Rank Adaptation. Instead of updating all 3.66 million parameters in the model, LoRA injects small trainable matrices (rank 16) into the attention layers and freezes everything else. That brings the trainable parameter count down to 226K, about 6% of the total. The reasoning: the model's pre-trained chemical knowledge is worth preserving, and with only ~5,500 training compounds, full fine-tuning would likely overfit badly.

I chose rank 16 after finding that rank 32 gave comparable validation performance with nearly double the parameters. That kind of decision — trading expressiveness for efficiency when the data doesn't justify the extra capacity — is one of those things you can read about but only really understand after you've had to make it.

---

## The problems that actually took time

**Class imbalance.** For some assays, toxic compounds are 3–5% of the data. A model that just predicts "safe" for everything would be right 95% of the time and completely useless. The fix is per-target positive weighting in the loss function — effectively telling the optimizer to care more about getting the rare class right. For NR-PPAR-γ, that weight was 31.8×.

**Masked loss.** The ~30% of "untested" entries in Tox21 are marked with −1 in the dataset. If I treated those as "non-toxic," I'd be training on a lot of wrong labels. The fix is to compute the loss only on entries that were actually tested and ignore the rest. It's not a difficult implementation, but you have to realize the problem exists. I didn't, initially.

**Per-target thresholds.** Each of the 12 assays has a different class balance and different consequences for false positives vs. false negatives. Using a single 0.5 threshold across all 12 makes no sense. I tuned each threshold separately on the validation set by sweeping from 0.1 to 0.95 and picking the value that maximized F1 per target. The resulting thresholds ranged from 0.65 to 0.95.

---

## What the numbers look like

Mean ROC-AUC of 0.8122 across all 12 endpoints. Individual targets ranged from 0.71 (NR-ER) to 0.88 (SR-MMP).

I also trained XGBoost and Random Forest baselines on the same data using ECFP4 molecular fingerprints — a different way of encoding molecular structure that doesn't use a transformer at all. ChemBERTa outperformed both on 7 of 12 targets, particularly on assays with complex structural dependencies. XGBoost was competitive on 5 targets where fingerprint-based pattern matching captured enough signal. Random Forest didn't beat either of the other two on any target.

I'm not going to oversell 0.8122. The Tox21 benchmark is hard, especially for targets with very few toxic training examples. A larger dataset — ChEMBL or PubChem BioAssay would both be candidates — would help substantially. The model is a useful early-stage triage tool, not a regulatory-grade predictor.

---

## Turning a model into an app

Getting a model working in a notebook is one kind of problem. Getting it running as a service someone else can use is a different kind entirely.

The backend is FastAPI on AWS App Runner. The ChemBERTa model is downloaded from my HuggingFace Hub repo and cached directly into the Docker image at build time, rather than downloading on each cold start. That was a deliberate tradeoff: the image is about 2.5GB, but the container starts warm. Downloading 500MB on cold start would mean 30–60 second waits per inference request, which kills the user experience for an interactive tool.

AWS Lambda was the obvious alternative but didn't work — Lambda's 512MB `/tmp` limit and 50MB compressed package limit are both incompatible with a model this size. App Runner handles scaling automatically and includes SSL termination and health checks without requiring me to configure load balancers and target groups separately.

The frontend is Next.js, exported as a fully static site and hosted on S3. This was a cost decision — S3 static hosting is negligible at this traffic level — but it came with a real constraint: Clerk's Next.js SDK uses Server Actions internally, which don't work with static exports. The workaround was switching to `@clerk/clerk-react` (the pure client-side SDK) and handling JWT verification on the FastAPI side instead.

ADMET property calculations run through RDKit and are completely independent of the neural model. Molecular weight, lipophilicity, hydrogen bond counts, Lipinski's Rule of Five, Veber rules, PAINS structural alerts — all computed deterministically from the SMILES string. This matters because drug-likeness filtering shouldn't depend on a probabilistic model.

Explainability runs through Captum's Integrated Gradients implementation. For the top-3 most probable toxic targets, the system traces which parts of the SMILES sequence most influenced the prediction. This is genuinely useful for medicinal chemists who want to understand which substructures are driving a flag.

The whole infrastructure is Terraform-managed. 20 frontend tests, 13 backend tests, all passing.

---

## What I actually learned

The fine-tuning work made concrete a lot of things that had been abstract to me. The relationship between loss function design and what a model actually learns. Why structured missingness in training data requires explicit handling. How LoRA works mechanically, and what rank and alpha actually control. How to evaluate a multi-label classifier without fooling yourself with aggregate metrics.

The productization work was useful differently. Infrastructure decisions have real consequences that only show up when you actually build the thing. The App Runner choice wasn't arbitrary — it followed directly from model size and cold start requirements. The Clerk workaround required debugging compatibility between a library version and a Next.js export mode that weren't designed to work together.

---

## What's next

Migrating the frontend to Vercel for a better development loop and to drop the static export workarounds. Eventually moving the backend off App Runner to reduce hosting costs — the service is stateless and containerized, so the migration is mostly plumbing.

On the model side: SMILES enumeration for data augmentation is the most straightforward next experiment. The same molecule can be represented as multiple valid SMILES strings, so you can expand your training set 5–10× without any new data. That's a known improvement for ChemBERTa specifically.

If you're working on something adjacent to this or want to see the code, I'm happy to talk.
