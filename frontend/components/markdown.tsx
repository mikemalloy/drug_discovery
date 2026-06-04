'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for the grounded AI summary.
 * Uses react-markdown + remark-gfm for full GFM support including tables.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-semibold text-foreground mt-5 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-foreground mt-4 mb-1.5">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-muted-foreground leading-relaxed my-2">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 space-y-1 my-2 text-sm text-muted-foreground">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 space-y-1 my-2 text-sm text-muted-foreground">{children}</ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => <em>{children}</em>,
        code: ({ children }) => (
          <code className="px-1 py-0.5 bg-muted text-xs font-mono">{children}</code>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold text-foreground bg-muted/50 border border-border/50">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-left text-muted-foreground border border-border/50">
            {children}
          </td>
        ),
      }}
    >
      {children || ''}
    </ReactMarkdown>
  )
}
