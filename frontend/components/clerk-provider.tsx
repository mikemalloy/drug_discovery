'use client'

import { ClerkProvider as BaseClerkProvider } from '@clerk/clerk-react'

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

if (!publishableKey) {
  console.warn('Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY')
}

export function ClerkProvider({ children }: { children: React.ReactNode }) {
  if (!publishableKey) {
    return <>{children}</>
  }

  return (
    <BaseClerkProvider publishableKey={publishableKey}>
      {children}
    </BaseClerkProvider>
  )
}
