'use client'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

const features = [
  { number:'01', title:'Tox21 Endpoints', description:'Screen compounds against 12 nuclear receptor and stress response pathways including NR-AR, NR-AhR, NR-ER, SR-ARE, SR-p53, and more.' },
  { number:'02', title:'ADMET Profiling', description:'Comprehensive drug-likeness analysis with Lipinski Rule of 5, Veber oral bioavailability rules, PAINS alerts, and key molecular descriptors.' },
  { number:'03', title:'Risk Scoring', description:'Weighted composite risk score with Low, Moderate, and High tier classification plus 2D molecular structure visualization.' },
]

export function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="min-h-screen bg-background bg-grid-pattern">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-4 lg:px-12 xl:px-24 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-1 h-6 bg-accent rounded-full" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Drug Discovery Platform</span>
          </div>
          <Button variant="outline" size="sm" className="text-xs font-medium tracking-wide uppercase" onClick={onGetStarted}>Launch App</Button>
        </div>
      </header>
      <main>
        <section className="px-6 pt-20 pb-16 lg:px-12 xl:px-24 lg:pt-32 lg:pb-24 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_300px] gap-16 items-start">
            <div>
              <div className="flex items-center gap-3 mb-10">
                <div className="w-8 h-0.5 bg-accent" />
                <span className="text-xs font-medium tracking-widest uppercase text-accent">AI-Powered Toxicity Screening</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.08]">
                Know <span className="accent-underline">the risk</span> before you run the assay.
              </h1>
              <p className="mt-8 text-lg text-muted-foreground leading-relaxed max-w-xl">Screen compounds against 12 Tox21 toxicity endpoints in seconds. Built for medicinal chemists and drug discovery scientists who need fast, reliable safety predictions.</p>
              <div className="accent-border-left mt-8 max-w-lg">
                <p className="text-sm text-muted-foreground leading-relaxed">From academic research to pharmaceutical development — our ChemBERTa-powered models bring the same precision to early-stage compound screening.</p>
              </div>
              <div className="mt-10">
                <Button size="lg" className="h-12 px-8" onClick={onGetStarted}>Get Started <ArrowRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </div>
            <div className="hidden lg:block pt-8">
              <nav className="space-y-4">
                {[['About', true], ['Features', false]].map(([label, active]) => (
                  <div key={String(label)} className="flex items-center gap-3">
                    <div className={`w-4 h-0.5 ${active ? 'bg-accent' : 'bg-border'}`} />
                    <span className={`text-xs font-medium tracking-wide uppercase ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </section>
        <section className="px-6 py-16 lg:px-12 xl:px-24 lg:py-24 max-w-7xl mx-auto border-t border-border">
          <div className="grid gap-12 lg:gap-16">
            {features.map(f => (
              <div key={f.title} className="grid lg:grid-cols-[100px_1fr] gap-6 items-start">
                <span className="text-5xl font-bold text-border/60">{f.number}</span>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-3">{f.title}</h3>
                  <p className="text-base text-muted-foreground leading-relaxed max-w-xl">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="px-6 py-16 lg:px-12 xl:px-24 lg:py-24 max-w-7xl mx-auto border-t border-border">
          <div className="grid sm:grid-cols-3 gap-8 lg:gap-16">
            <div><p className="text-5xl font-bold text-foreground">12</p><p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Tox21 Endpoints</p></div>
            <div><p className="text-5xl font-bold text-foreground">{'<'}90<span className="text-2xl">s</span></p><p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Analysis Time</p></div>
            <div><p className="text-5xl font-bold text-foreground">ADMET</p><p className="text-sm text-muted-foreground mt-2 uppercase tracking-wide">Full Profiling</p></div>
          </div>
        </section>
        <footer className="border-t border-border px-6 py-8 lg:px-12 xl:px-24">
          <div className="max-w-7xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4"><div className="w-1 h-5 bg-accent rounded-full" /><span className="text-sm text-muted-foreground">Drug Discovery Platform</span></div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Fine-tuned on the Tox21 dataset</p>
          </div>
        </footer>
      </main>
    </div>
  )
}
