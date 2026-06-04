'use client'

import { useMemo } from 'react'

/**
 * Minimal, dependency-free Markdown renderer for the grounded AI summary.
 *
 * SAFETY: the input text originates from our own Claude call, but part of the
 * prompt (the compound name) is user-supplied, so we treat the whole string as
 * untrusted. We HTML-escape first, THEN apply a fixed set of Markdown→HTML
 * transforms. Because every raw `<` becomes `&lt;` before any transform runs,
 * no attacker-supplied markup can survive into the DOM — only the tags we emit
 * for headings/bold/italic/code/lists/paragraphs.
 *
 * Scope is intentionally small (h1–h3, bold, italic, inline code, ordered and
 * unordered lists, paragraphs) — exactly what the summary prompt is told to use.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(s: string): string {
  // order matters: code first so its contents aren't re-processed
  return s
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-muted text-xs font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')
}

function isSeparatorRow(line: string): boolean {
  return isTableRow(line) && /^\|[\s|:-]+\|$/.test(line.trim())
}

function parseTableCells(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map(c => c.trim())
}

function toHtml(md: string): string {
  const lines = escapeHtml(md.replace(/\r\n/g, '\n')).split('\n')
  const out: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inTable = false
  let tableHeaderDone = false

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table></div>')
      inTable = false
      tableHeaderDone = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Table rows
    if (isTableRow(line)) {
      closeList()
      if (isSeparatorRow(line)) {
        // separator between header and body — switch from thead to tbody
        if (inTable) {
          out.push('</thead><tbody>')
          tableHeaderDone = true
        }
        continue
      }
      const cells = parseTableCells(line)
      if (!inTable) {
        out.push('<div class="my-3 overflow-x-auto"><table class="w-full text-sm border-collapse">')
        out.push('<thead>')
        inTable = true
        tableHeaderDone = false
      }
      const tag = tableHeaderDone ? 'td' : 'th'
      const cls = tableHeaderDone
        ? 'px-3 py-2 text-left text-muted-foreground border border-border/50'
        : 'px-3 py-2 text-left font-semibold text-foreground bg-muted/50 border border-border/50'
      const row = cells.map(c => `<${tag} class="${cls}">${inline(c)}</${tag}>`).join('')
      out.push(`<tr>${row}</tr>`)
      continue
    }

    // Non-table line — close any open table
    closeTable()

    if (!line.trim()) {
      closeList()
      continue
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length
      const cls =
        level === 1
          ? 'text-base font-semibold text-foreground mt-6 mb-2'
          : level === 2
          ? 'text-sm font-semibold text-foreground mt-5 mb-2'
          : 'text-sm font-semibold text-foreground mt-4 mb-1.5'
      out.push(`<h${level} class="${cls}">${inline(h[2])}</h${level}>`)
      continue
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol class="list-decimal pl-5 space-y-1 my-2 text-sm text-muted-foreground">')
        listType = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul class="list-disc pl-5 space-y-1 my-2 text-sm text-muted-foreground">')
        listType = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }

    closeList()
    out.push(`<p class="text-sm text-muted-foreground leading-relaxed my-2">${inline(line)}</p>`)
  }
  closeList()
  closeTable()
  return out.join('\n')
}

export function Markdown({ children }: { children: string }) {
  const html = useMemo(() => toHtml(children || ''), [children])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
