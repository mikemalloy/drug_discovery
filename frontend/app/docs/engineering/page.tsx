import type { Metadata } from 'next'
import { DocPage } from '@/components/docs/doc-page'
import { MermaidDiagram } from '@/components/docs/mermaid-diagram'

export const metadata: Metadata = {
  title: 'Engineering Documentation — Drug Discovery Platform',
  description: 'System architecture, LoRA fine-tuning, and the roadmap for scaling predictive performance.',
}

const ARCH_DIAGRAM = `flowchart TB
    subgraph CLIENT["Client — static, S3-hosted"]
        UI["Next.js 16 / React 19 SPA<br/>static export"]
        CLERK["Clerk (React SDK)<br/>issues JWT"]
        UI --> CLERK
    end
    subgraph SERVE["Serving runtime — AWS App Runner (CPU)"]
        API["FastAPI service<br/>/health /analyze /screen /summarize"]
        AUTH["JWT verification<br/>(Clerk JWKS)"]
        API --> AUTH
        subgraph INFER["Inference & analysis layer"]
            MODEL["ChemBERTa + LoRA<br/>12-target classifier<br/>+ temperature scaling"]
            CHEM["RDKit<br/>ADMET / Lipinski / Veber / PAINS"]
            AD["Applicability domain<br/>Morgan-FP Tanimoto k-NN"]
            XAI["Explainability<br/>Captum Integrated Gradients"]
            SUM["Plain-language summary<br/>Claude Haiku (grounded)"]
        end
        API --> MODEL
        API --> CHEM
        API --> AD
        API --> XAI
        API --> SUM
    end
    subgraph TRAIN["Offline training pipeline (Colab / GPU)"]
        DATA["Tox21 dataset<br/>scaffold split"]
        FT["LoRA fine-tune<br/>masked multi-label BCE"]
        WANDB["Weights & Biases<br/>experiment tracking"]
        DATA --> FT --> WANDB
    end
    subgraph REGISTRY["Model registry"]
        HUB["HuggingFace Hub<br/>pinned revision (SHA)"]
    end
    subgraph INFRA["Infrastructure & governance"]
        TF["Terraform<br/>ECR · App Runner · IAM · S3"]
        AUDIT["Summary audit log<br/>model id · timestamp · input hashes"]
    end
    UI -- "HTTPS + Bearer JWT" --> API
    FT -- "merge_and_unload + push" --> HUB
    HUB -- "baked into Docker image at build" --> MODEL
    SUM -.-> AUDIT
    TF -.provisions.-> SERVE
    TF -.provisions.-> CLIENT`


export default function EngineeringDocPage() {
  return (
    <DocPage eyebrow="Engineering" title="How the system is built">
      <p>A technical walkthrough of how the toxicity-screening platform is built — the system architecture, the fine-tuning approach, and the roadmap for improving predictive performance.</p>
      <p>The project’s guiding constraint was deliberate: demonstrate professional AI-engineering practice — reproducibility, calibration, governance, and clean productionisation — on hardware a solo developer can actually run.</p>
      <h2>1. System architecture</h2>
      <p>The platform splits into three planes: an <strong>offline training pipeline</strong>, a <strong>serving runtime</strong>, and a <strong>static client</strong>. The model registry (HuggingFace Hub) is the seam between training and serving.</p>
      <MermaidDiagram chart={ARCH_DIAGRAM} />
      <h3>Notable design decisions</h3>
      <p><strong>Model baked into Docker at build time</strong> — the container starts warm; pulling ~500 MB per cold start would mean 30–60 s of latency.</p>
      <p><strong>App Runner over Lambda</strong> — Lambda’s 512 MB <code>/tmp</code> and 50 MB package limits are incompatible with this model.</p>
      <p><strong>Static frontend on S3</strong> — the client uses <code>@clerk/clerk-react</code> and JWT verification moves to FastAPI.</p>
      <p><strong>Advisory layers degrade gracefully</strong> and never break <code>/analyze</code>.</p>
      <p><strong>Governance built in</strong> — pinned model revisions, audit log with SHA-256 hashes, fully Terraform-managed.</p>
      <hr />
      <h2>2. Fine-tuning an open-source model</h2>
      <h3>Base model</h3>
      <p><strong><code>DeepChem/ChemBERTa-77M-MTR</code></strong> — a RoBERTa-style transformer pre-trained on 77 million SMILES. The task was adaptation, not pre-training.</p>
      <h3>Why LoRA</h3>
      <p>The model is small (3.66 M params) and the dataset is small (~5,500 compounds). <strong>LoRA</strong> freezes the base weights and injects trainable low-rank matrices into the attention projections.</p>
      <table>
        <thead><tr><th>Hyperparameter</th><th>Value</th><th>Rationale</th></tr></thead>
        <tbody>
          <tr><td>Adapter rank r</td><td>16</td><td>Rank 32 gave comparable AUC for ~2× the parameters</td></tr>
          <tr><td>lora_alpha</td><td>32</td><td>Standard 2×r scaling</td></tr>
          <tr><td>lora_dropout</td><td>0.1</td><td>Regularisation against the small dataset</td></tr>
          <tr><td>target_modules</td><td>["query", "value"]</td><td>Q/V attention projections</td></tr>
          <tr><td>modules_to_save</td><td>["classifier"]</td><td>12-logit head trained in full</td></tr>
          <tr><td>Trainable params</td><td>226K / 3.66M (6.18%)</td><td>The headline efficiency win</td></tr>
        </tbody>
      </table>
      <h3>The problems that actually mattered</h3>
      <ul>
        <li><strong>Masked multi-label loss</strong> — ~30% of entries are untested (<code>-1</code>); loss computed only over tested entries.</li>
        <li><strong>Per-target class weighting</strong> — positive rates as low as 3–5%.</li>
        <li><strong>Per-target thresholds and calibration</strong> — temperature scaling calibrates probabilities to empirical frequency.</li>
      </ul>
      <h3>QLoRA: considered and deliberately not used</h3>
      <p>At 3.66 M parameters there is no memory pressure to relieve, and 4-bit quantization introduces error with no offsetting saving.</p>
      <table>
        <thead><tr><th>Technique</th><th>Right call here?</th><th>Frozen base memory</th><th>Precision cost</th></tr></thead>
        <tbody>
          <tr><td>Full fine-tune</td><td>Never (overfits)</td><td>Full</td><td>None</td></tr>
          <tr><td>LoRA (chosen)</td><td>Yes — small base, small dataset</td><td>Full (cheap)</td><td>None</td></tr>
          <tr><td>QLoRA</td><td>Only if backbone grows to 100M+ params</td><td>4-bit (NF4)</td><td>Some</td></tr>
        </tbody>
      </table>
      <hr />
      <h2>3. Scaling predictive performance</h2>
      <p>Mean ROC-AUC of <strong>≈0.78</strong> on a scaffold split, capped by data volume. <strong>Which dataset we pursue next is gated on user feedback.</strong></p>
      <p><strong>ChEMBL</strong> — ~2.4 M bioactive compounds; richest source for expanding beyond 12 endpoints.</p>
      <p><strong>PubChem BioAssay (PCBA)</strong> — ~440K compounds across 128 bioassays; most natural next step.</p>
      <p><strong>ToxCast</strong> — the broader EPA program Tox21 is a subset of; most on-target for deepening toxicity.</p>
      <p><strong>SMILES enumeration</strong> — expands the training set 5–10× with no new data.</p>
      <p>Any larger backbone is exactly where QLoRA flips from unnecessary to the right tool. The governance scaffolding is already in place for a controlled retraining.</p>
    </DocPage>
  )
}
