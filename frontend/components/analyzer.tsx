'use client'
import { useState } from 'react'
import { Header } from '@/components/header'
import { AnalysisProgress } from '@/components/analysis-progress'
import { ResultsDisplay } from '@/components/results-display'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { analyzeCompound, summarizeCompound, ApiError } from '@/lib/api'
import type { AnalyzeResponse, SummarizeResponse } from '@/types/report'
import { ArrowRight, AlertCircle } from 'lucide-react'

// Clerk removed: no JWT. lib/api.ts still takes a token-getter, so we pass a
// no-op. The backend must accept unauthenticated requests (bot protection is the
// front-door human check / Turnstile, not a per-request Clerk JWT).
const noToken = async () => null

export function Analyzer() {
  const [smiles, setSmiles] = useState('')
  const [compoundName, setCompoundName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [summary, setSummary] = useState<SummarizeResponse | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const handleAnalyze = async () => {
    if (!smiles.trim()) return
    setIsLoading(true); setStartTime(Date.now()); setError(null); setResult(null); setSummary(null)
    try {
      const data = await analyzeCompound({ smiles: smiles.trim(), compound_name: compoundName.trim() || undefined }, noToken)
      setResult(data)
      setSummaryLoading(true)
      summarizeCompound(data, noToken).then(setSummary).catch(() => setSummary({ available: false, reason: 'request failed' })).finally(() => setSummaryLoading(false))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'An unexpected error occurred. Please try again.')
    } finally { setIsLoading(false); setStartTime(null) }
  }

  const handleRetry = () => { setError(null); handleAnalyze() }
  const handleReset = () => { setError(null); setResult(null); setSummary(null) }

  return (
    <div className="min-h-screen bg-background bg-grid-pattern">
      <Header />
      <main className="px-6 py-12 lg:px-12 xl:px-24 lg:py-16 max-w-7xl mx-auto">
        {result ? (
          <ResultsDisplay data={result} summary={summary} summaryLoading={summaryLoading} smiles={smiles.trim()} onReset={handleReset} />
        ) : (
          <div className="grid gap-12 lg:grid-cols-[380px_1fr] lg:gap-20">
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-0.5 bg-accent" />
                <span className="text-xs font-medium tracking-widest uppercase text-accent">Compound Input</span>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                  <Label htmlFor="smiles" className="text-xs font-medium tracking-wide uppercase text-muted-foreground">SMILES String</Label>
                  <Textarea id="smiles" placeholder="CC(=O)Oc1ccccc1C(=O)O" className="font-mono min-h-[120px] resize-none bg-card border-border placeholder:text-muted-foreground/50 focus:border-accent focus:ring-accent/20" value={smiles} onChange={e => setSmiles(e.target.value)} disabled={isLoading} aria-describedby="smiles-help" />
                  <p id="smiles-help" className="text-xs text-muted-foreground">Enter a valid SMILES notation for the compound</p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="compound-name" className="text-xs font-medium tracking-wide uppercase text-muted-foreground">Compound Name <span className="normal-case tracking-normal font-normal ml-2">(optional)</span></Label>
                  <Input id="compound-name" placeholder="e.g. Aspirin" className="bg-card border-border placeholder:text-muted-foreground/50 focus:border-accent focus:ring-accent/20" value={compoundName} onChange={e => setCompoundName(e.target.value)} disabled={isLoading} />
                </div>
                <Button onClick={handleAnalyze} disabled={isLoading || !smiles.trim()} className="w-full h-12 font-medium bg-primary hover:bg-primary/90 text-primary-foreground" size="lg">
                  {isLoading ? 'Analyzing...' : 'Analyze Compound'}{!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
              {isLoading && <div className="pt-4 border-t border-border"><AnalysisProgress isLoading={isLoading} startTime={startTime} /></div>}
            </div>
            <div>
              {error && (
                <div className="mb-8 p-5 border-l-3 border-l-accent bg-accent/5">
                  <div className="flex items-start gap-4">
                    <AlertCircle className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                    <div className="flex-1"><p className="text-sm font-semibold text-foreground mb-1">Analysis Error</p><p className="text-sm text-muted-foreground">{error}</p></div>
                    <button onClick={handleRetry} className="text-sm font-medium text-accent hover:underline underline-offset-4">Retry</button>
                  </div>
                </div>
              )}
              {!error && !isLoading && (
                <div className="h-full min-h-[500px] flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-8"><div className="w-8 h-0.5 bg-accent" /><span className="text-xs font-medium tracking-widest uppercase text-accent">Ready to Analyze</span></div>
                  <h2 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-6">Screen your compound<br /><span className="accent-underline">against Tox21</span>.</h2>
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-lg mb-8">Enter a SMILES string and click Analyze to screen your compound against 12 Tox21 toxicity endpoints with full ADMET profiling.</p>
                  <div className="accent-border-left"><p className="text-sm text-muted-foreground leading-relaxed">Our ML models provide risk stratification across nuclear receptor and stress response pathways with comprehensive molecular property analysis.</p></div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
