import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface DocPageProps { eyebrow: string; title: string; children: React.ReactNode }

export function DocPage({ eyebrow, title, children }: DocPageProps) {
  return (
    <div className="min-h-screen bg-background bg-grid-pattern">
      <main className="max-w-7xl mx-auto px-6 py-10 lg:px-12 xl:px-24 lg:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" />Back
        </Link>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-0.5 bg-accent" />
          <span className="text-xs font-medium tracking-widest uppercase text-accent">{eyebrow}</span>
        </div>
        <h1 className="text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-foreground max-w-[22ch] mb-10">{title}</h1>
        <div className="doc-prose max-w-[760px]">{children}</div>
      </main>
    </div>
  )
}
