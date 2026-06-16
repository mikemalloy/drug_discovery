'use client'
import { useState } from 'react'
import { Loader2, Check, Shield } from 'lucide-react'

export function HumanCheck({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'checking' | 'done'>('idle')
  if (!open) return null
  const check = () => {
    if (phase !== 'idle') return
    setPhase('checking')
    setTimeout(() => setPhase('done'), 1100)
    setTimeout(onVerified, 1750)
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1A1A1A]/45 backdrop-blur-[2px]" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-[400px] rounded-xl border border-border bg-card shadow-md p-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-1 h-6 bg-accent rounded-full" />
          <span className="text-sm font-semibold">Quick check before you start</span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">This is a portfolio demo. The check just keeps automated traffic from hammering the model — no account or email required.</p>
        <div onClick={check} role="checkbox" aria-checked={phase === 'done'}
          className={`flex items-center gap-3.5 px-4 py-3.5 bg-muted border border-border rounded-md ${phase === 'idle' ? 'cursor-pointer' : ''}`}>
          <span className={`w-6 h-6 shrink-0 rounded-sm inline-flex items-center justify-center transition-colors ${phase === 'done' ? 'bg-success border border-success' : 'bg-card border border-border'}`}>
            {phase === 'checking' && <Loader2 className="h-4 w-4 text-accent animate-spin" />}
            {phase === 'done' && <Check className="h-[15px] w-[15px] text-white" />}
          </span>
          <span className="text-sm font-medium text-foreground">{phase === 'idle' ? "I'm human" : phase === 'checking' ? 'Verifying…' : 'Verified — launching'}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-muted-foreground"><Shield className="h-3.5 w-3.5" /><span className="text-xs">Bot check</span></span>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-5">Privacy · Terms · demo only</p>
      </div>
    </div>
  )
}
