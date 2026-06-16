'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Microscope, Cpu, ShieldCheck } from 'lucide-react'

const DOC_ITEMS = [
  { key:'scientific', href:'/docs/scientific', label:'Scientific Analysis Documentation', desc:'What the platform predicts and why', Icon: Microscope },
  { key:'engineering', href:'/docs/engineering', label:'Engineering Documentation', desc:'System architecture & model fine-tuning', Icon: Cpu },
]

function DocsMenu() {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors">
        Documentation
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-72 rounded-lg border border-border bg-card shadow-md overflow-hidden">
            {DOC_ITEMS.map((item, i) => (
              <Link key={item.key} href={item.href} onClick={() => setOpen(false)}
                className={`flex items-start gap-3 px-4 py-3.5 hover:bg-muted transition-colors ${i > 0 ? 'border-t border-border' : ''}`}>
                <item.Icon className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                  <span className="block mt-0.5 text-xs text-muted-foreground">{item.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center justify-between px-6 lg:px-12 xl:px-24 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div className="w-1 h-6 bg-accent rounded-full" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">Drug Discovery Platform</span>
            <span className="text-xs text-muted-foreground tracking-wide uppercase">/ Toxicity Screening</span>
          </div>
        </div>
        <nav className="flex items-center gap-6">
          <DocsMenu />
          <span title="Human verified" className="inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-success">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified
          </span>
        </nav>
      </div>
    </header>
  )
}
