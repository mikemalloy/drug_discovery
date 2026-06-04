export interface ToxicityTarget {
  probability: number
  label: 'safe' | 'toxic'
  threshold: number
}

export interface AdmetProfile {
  molecular_weight: number
  logp: number
  hbd: number
  hba: number
  tpsa: number
  rotatable_bonds: number
  lipinski_pass: boolean
  veber_pass: boolean
  pains_alerts: string[]
}

export interface RiskSummary {
  composite_score: number
  tier: 'Low' | 'Moderate' | 'High'
  toxic_targets: string[]
  flagged_targets: string[]
}

export interface NearestNeighbor {
  smiles: string
  similarity: number
}

// Mirrors backend _safe_ad(): on success `available` is true and the assessment
// fields are present; if the reference set is missing it degrades to
// { available: false, reason }.
export interface ApplicabilityDomain {
  available: boolean
  reason?: string
  in_domain?: boolean
  reliability?: 'high' | 'moderate' | 'low' | 'invalid'
  max_similarity?: number
  mean_top_k_similarity?: number
  k?: number
  threshold?: number
  nearest_neighbors?: NearestNeighbor[]
}

export interface AnalyzeResponse {
  smiles: string
  canonical_smiles: string
  compound_name: string
  structure_svg: string
  toxicity: {
    [target: string]: ToxicityTarget
  }
  admet: AdmetProfile
  risk_summary: RiskSummary
  applicability_domain?: ApplicabilityDomain
}

export interface AnalyzeRequest {
  smiles: string
  compound_name?: string
}

export interface SummaryGovernance {
  model: string
  generated_at: string
  prompt_sha256: string
  input_report_sha256: string
  temperature: number
  input_tokens?: number | null
  output_tokens?: number | null
}

// Mirrors backend summary.generate_summary(): available+markdown+governance on
// success, or { available: false, reason } when the LLM is unconfigured/unreachable.
export interface SummarizeResponse {
  available: boolean
  reason?: string
  markdown?: string
  governance?: SummaryGovernance
}

export const TOXICITY_TARGETS = [
  'NR-AR',
  'NR-AR-LBD',
  'NR-AhR',
  'NR-Aromatase',
  'NR-ER',
  'NR-ER-LBD',
  'NR-PPAR-gamma',
  'SR-ARE',
  'SR-ATAD5',
  'SR-HSE',
  'SR-MMP',
  'SR-p53',
] as const

export type ToxicityTargetName = (typeof TOXICITY_TARGETS)[number]
