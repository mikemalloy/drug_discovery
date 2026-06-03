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
}

export interface AnalyzeRequest {
  smiles: string
  compound_name?: string
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
