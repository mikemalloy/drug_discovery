'use client'
import { useEffect, useRef, useState } from 'react'

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: {
          primaryColor:'#F5F4F2', primaryTextColor:'#2B2B2B', primaryBorderColor:'#E5E4E2',
          lineColor:'#71717A', secondaryColor:'#FAF9F7', tertiaryColor:'#FFFFFF',
          mainBkg:'#F5F4F2', clusterBkg:'#FAF9F7', nodeBorder:'#E5E4E2',
          titleColor:'#2B2B2B', edgeLabelBackground:'#FAF9F7',
          fontFamily:'Inter, Helvetica Neue, Arial, sans-serif', fontSize:'13px' } })
        if (!ref.current) return
        const id = 'mermaid-' + Math.random().toString(36).slice(2)
        const { svg } = await mermaid.render(id, chart)
        if (ref.current) ref.current.innerHTML = svg
      } catch (e) { setError(e instanceof Error ? e.message : 'Diagram failed to render') }
    }
    render()
  }, [chart])
  if (error) return <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">Diagram could not be rendered: {error}</div>
  return <div ref={ref} className="overflow-x-auto rounded-lg border border-border bg-card p-6 my-2" aria-label="System architecture diagram" />
}
