'use client'

import { UserButton } from '@clerk/clerk-react'
import { FlaskConical } from 'lucide-react'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center justify-between px-6 lg:px-12 xl:px-24 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          {/* Red accent bar */}
          <div className="w-1 h-6 bg-accent rounded-full" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Drug Discovery Platform
            </span>
            <span className="text-xs text-muted-foreground tracking-wide uppercase">
              / Toxicity Screening
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-6">
          <span className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer tracking-wide uppercase">
            Documentation
          </span>
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'h-8 w-8',
              },
            }}
          />
        </nav>
      </div>
    </header>
  )
}
