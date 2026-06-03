'use client'

import type { AnalyzeResponse } from '@/types/report'
import { TOXICITY_TARGETS } from '@/types/report'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertTriangle, Shield, ShieldAlert, ShieldCheck } from 'lucide-react'

interface ResultsDisplayProps {
  data: AnalyzeResponse
}

function RiskBadge({ tier }: { tier: 'Low' | 'Moderate' | 'High' }) {
  const config = {
    Low: {
      label: 'Low Risk',
      className: 'bg-success/10 text-success',
      icon: ShieldCheck,
    },
    Moderate: {
      label: 'Moderate Risk',
      className: 'bg-warning/10 text-warning',
      icon: Shield,
    },
    High: {
      label: 'High Risk',
      className: 'bg-accent/10 text-accent',
      icon: ShieldAlert,
    },
  }

  const { className, label, icon: Icon } = config[tier]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold',
        className
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </span>
  )
}

function PassFailIndicator({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="inline-flex items-center gap-1.5 text-success text-sm font-medium">
      <CheckCircle2 className="h-4 w-4" />
      Pass
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-accent text-sm font-medium">
      <XCircle className="h-4 w-4" />
      Fail
    </span>
  )
}

export function ResultsDisplay({ data }: ResultsDisplayProps) {
  const toxicCount = Object.values(data.toxicity).filter(t => t.label?.toLowerCase() === 'toxic').length
  const safeCount = Object.values(data.toxicity).filter(t => t.label?.toLowerCase() === 'safe').length

  return (
    <div className="space-y-12">
      {/* Section label with red accent */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-0.5 bg-accent" />
        <span className="text-xs font-medium tracking-widest uppercase text-accent">
          Analysis Results
        </span>
      </div>

      {/* Safety Summary */}
      <div className="grid sm:grid-cols-3 gap-8">
        <div>
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground mb-3">Risk Assessment</p>
          <RiskBadge tier={data.risk_summary.tier} />
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground mb-3">Composite Score</p>
          <p className="text-4xl font-bold text-foreground tabular-nums">
            {data.risk_summary.composite_score.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground mb-3">Endpoint Summary</p>
          <div className="flex items-center gap-6">
            <span className="text-sm font-medium"><span className="text-success">{safeCount}</span> Safe</span>
            <span className="text-sm font-medium"><span className="text-accent">{toxicCount}</span> Toxic</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      <div className="grid gap-12 lg:grid-cols-2">
        {/* ADMET Profile */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-6 tracking-tight">
            ADMET Profile
          </h2>
          <div className="space-y-0">
            {[
              { label: 'Molecular Weight', value: `${data.admet.molecular_weight.toFixed(2)} Da` },
              { label: 'LogP', value: data.admet.logp.toFixed(2) },
              { label: 'H-Bond Donors', value: data.admet.hbd },
              { label: 'H-Bond Acceptors', value: data.admet.hba },
              { label: 'TPSA', value: `${data.admet.tpsa.toFixed(2)} A²` },
              { label: 'Rotatable Bonds', value: data.admet.rotatable_bonds },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-3 border-b border-border/50">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-mono font-medium text-foreground">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Lipinski Rule of 5</span>
              <PassFailIndicator pass={data.admet.lipinski_pass} />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Veber Rules</span>
              <PassFailIndicator pass={data.admet.veber_pass} />
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">PAINS Alerts</span>
              {data.admet.pains_alerts.length === 0 ? (
                <span className="text-sm text-success font-medium">None</span>
              ) : (
                <span className="text-sm text-accent font-medium">
                  {data.admet.pains_alerts.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Molecular Structure */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-6 tracking-tight">
            Molecular Structure
          </h2>
          <div className="bg-card border border-border p-8 flex items-center justify-center min-h-[280px]">
            <div
              className="molecule-svg-container max-w-full"
              dangerouslySetInnerHTML={{ __html: data.structure_svg }}
            />
          </div>
          {data.compound_name && (
            <p className="mt-4 text-sm text-muted-foreground text-center font-medium">
              {data.compound_name}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border" />

      {/* Toxicity Endpoints */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">
            Tox21 Toxicity Endpoints
          </h2>
          {toxicCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <AlertTriangle className="h-3.5 w-3.5" />
              {toxicCount} endpoint{toxicCount > 1 ? 's' : ''} flagged
            </span>
          )}
        </div>
        <div className="border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground h-11">
                  Target
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-right h-11">
                  Probability
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-right h-11">
                  Result
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TOXICITY_TARGETS.map((target) => {
                const result = data.toxicity[target]
                if (!result) return null
                const isToxic = result.label?.toLowerCase() === 'toxic'

                return (
                  <TableRow
                    key={target}
                    className={cn(
                      'border-b border-border/50 last:border-0 hover:bg-transparent',
                      isToxic && 'bg-accent/5'
                    )}
                  >
                    <TableCell className="text-sm font-mono py-3">
                      {target}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono py-3 text-muted-foreground">
                      {(result.probability * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-sm text-right py-3">
                      {isToxic ? (
                        <span className="inline-flex items-center gap-1.5 text-accent font-medium">
                          <XCircle className="h-3.5 w-3.5" />
                          Toxic
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-success font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Safe
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
