import type { Metadata } from 'next'
import { DocPage } from '@/components/docs/doc-page'

export const metadata: Metadata = {
  title: 'Scientific Analysis Documentation — Drug Discovery Platform',
  description: 'What the platform predicts, how to read every number it returns, and where its predictions can and cannot be trusted.',
}

export default function ScientificDocPage() {
  return (
    <DocPage eyebrow="Scientific Analysis" title="What the platform predicts, and how to read it">
      <p>A guide for medicinal chemists, toxicologists, and discovery scientists. This explains what the platform predicts, how to read every number it returns, and — just as importantly — where its predictions can and cannot be trusted.</p>
      <h2>What this tool is for</h2>
      <p>Drug candidates fail for many reasons, and toxicity is one of the most expensive — particularly when it surfaces late. This platform is an <strong>early-stage triage tool</strong>: paste in a structure and, in seconds, get an estimated toxicity profile across twelve well-characterised biological endpoints, alongside standard drug-likeness properties.</p>
      <p>It is built to help you <strong>prioritise and deprioritise compounds</strong> and narrow a list before committing assay time. It is <strong>not</strong> a regulatory-grade predictor and is not a substitute for experimental testing.</p>
      <h2>How you interact with it</h2>
      <p>The only required input is a <strong>SMILES string</strong> — the standard text notation for a molecular structure. Aspirin, for example, is <code>CC(=O)Oc1ccccc1C(=O)O</code>. The structure is parsed and canonicalised before anything else runs, so an invalid SMILES is rejected immediately.</p>
      <h2>The toxicity predictions</h2>
      <p>The core of the platform is a molecular transformer model (ChemBERTa, fine-tuned on the <strong>Tox21</strong> benchmark). For any structure you submit, the model returns a <strong>calibrated probability of toxicity for each of the twelve endpoints</strong>, a <strong>toxic / safe verdict</strong> per endpoint, and an overall risk score.</p>
      <h3>The twelve endpoints</h3>
      <p>The <strong>Nuclear Receptor (NR)</strong> panel covers hormone and metabolic signalling. The <strong>Stress Response (SR)</strong> panel covers cellular damage and defence pathways.</p>
      <table>
        <thead><tr><th>Endpoint</th><th>Pathway</th><th>What a flag suggests</th></tr></thead>
        <tbody>
          <tr><td>NR-AR</td><td>Androgen receptor</td><td>Potential androgen-pathway disruption</td></tr>
          <tr><td>NR-AR-LBD</td><td>Androgen receptor (ligand-binding domain)</td><td>Direct binding at the AR ligand site</td></tr>
          <tr><td>NR-AhR</td><td>Aryl hydrocarbon receptor</td><td>Xenobiotic / dioxin-like response</td></tr>
          <tr><td>NR-Aromatase</td><td>Aromatase enzyme</td><td>Interference with estrogen biosynthesis</td></tr>
          <tr><td>NR-ER</td><td>Estrogen receptor</td><td>Potential estrogen-pathway disruption</td></tr>
          <tr><td>NR-ER-LBD</td><td>Estrogen receptor (ligand-binding domain)</td><td>Direct binding at the ER ligand site</td></tr>
          <tr><td>NR-PPAR-γ</td><td>Peroxisome proliferator-activated receptor γ</td><td>Metabolic / lipid-regulation interference</td></tr>
          <tr><td>SR-ARE</td><td>Antioxidant response element</td><td>Oxidative-stress response activation</td></tr>
          <tr><td>SR-ATAD5</td><td>ATAD5 genotoxicity marker</td><td>DNA-damage / genotoxic signal</td></tr>
          <tr><td>SR-HSE</td><td>Heat-shock response element</td><td>Cellular stress / protein-damage response</td></tr>
          <tr><td>SR-MMP</td><td>Mitochondrial membrane potential</td><td>Mitochondrial toxicity</td></tr>
          <tr><td>SR-p53</td><td>p53 DNA-damage response</td><td>DNA-damage-triggered tumour-suppressor activation</td></tr>
        </tbody>
      </table>
      <h3>How to read a probability</h3>
      <p>Each endpoint reports a <strong>calibrated</strong> probability between 0 and 1, and has its <strong>own decision threshold</strong> tuned on validation data — the report shows both so you can see how close a call was.</p>
      <h3>The overall risk score</h3>
      <p>A single <strong>composite risk score</strong> (0 to 1) and tier — Low, Moderate, or High — weighted across the twelve endpoints. Use it for ranking; use the per-endpoint breakdown to understand <em>why</em>.</p>
      <h2>Drug-likeness and structural alerts (ADMET)</h2>
      <p>Physicochemical properties computed directly with RDKit — exact calculations, not model predictions. The report evaluates <strong>Lipinski’s Rule of Five</strong>, <strong>Veber’s rules</strong>, and screens for <strong>PAINS</strong>.</p>
      <h2>Is the prediction trustworthy here? — The applicability domain</h2>
      <p>The <strong>applicability-domain check</strong> compares your molecule to the training compounds using Tanimoto similarity and reports an in-domain / out-of-domain verdict, a reliability rating, and the nearest training compounds. If a compound comes back out-of-domain, take the toxicity numbers with real caution.</p>
      <h2>Why did it flag that? — Explainability</h2>
      <p>For the three highest-scoring endpoints, the platform highlights <strong>which atoms most influenced the prediction</strong> using Integrated Gradients (Captum). Treat these as the model’s rationale rather than mechanistic ground truth.</p>
      <h2>The plain-language summary</h2>
      <p>An optional short summary constrained to interpret <strong>only the numbers the platform already produced</strong>. It makes no clinical, dosing, or fitness-for-use recommendations.</p>
      <h2>Batch screening</h2>
      <p>Batch screening returns a list of SMILES (up to 100) <strong>ranked from lowest to highest overall risk</strong>. <strong>Availability:</strong> fully implemented in the backend as an <strong>API endpoint</strong>, but no UI yet. Please <a href="mailto:mike.malloy.2004@gmail.com">get in touch</a> to discuss API access.</p>
      <h2>How accurate is it, really?</h2>
      <p>Evaluated under a <strong>scaffold split</strong>, the model reaches a <strong>mean ROC-AUC of ≈0.78</strong> across the 12 endpoints — genuine signal, capped by data volume.</p>
      <h2>What to keep in mind</h2>
      <ul>
        <li>Every toxicity number is a <strong>model estimate</strong>, not a measured result.</li>
        <li>This is a <strong>triage tool</strong>, not a regulatory-grade predictor.</li>
        <li>A <strong>toxic flag</strong> is a reason to look more closely — check how close the probability was to its threshold.</li>
        <li>A <strong>safe verdict on an out-of-domain molecule</strong> is weak evidence.</li>
        <li><strong>ADMET / PAINS</strong> are exact calculations; toxicity predictions are probabilistic.</li>
        <li>The model knows only what <strong>Tox21</strong> taught it — twelve endpoints.</li>
      </ul>
    </DocPage>
  )
}
