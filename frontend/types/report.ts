export interface ToxicityTarget {
  probability: number;
  label: 'safe' | 'toxic';
  threshold: number;
}

export interface AdmetProfile {
  molecular_weight: number;
  logp: number;
  hbd: number;
  hba: number;
  tpsa: number;
  rotatable_bonds: number;
  lipinski_pass: boolean;
  veber_pass: boolean;
  pains_alerts: string[];
}

export interface RiskSummary {
  composite_score: number;
  tier: 'Low' | 'Moderate' | 'High';
  toxic_targets: string[];
  flagged_targets: string[];
}

export interface AnalyzeResponse {
  smiles: string;
  canonical_smiles: string;
  compound_name: string;
  structure_svg: string;
  toxicity: Record<string, ToxicityTarget>;
  admet: AdmetProfile;
  explainability: Record<string, unknown>; // present in API but not rendered in V1
  risk_summary: RiskSummary;
}
