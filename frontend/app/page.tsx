'use client'

import { SignedIn, SignedOut } from '@clerk/clerk-react'
import { LandingPage } from '@/components/landing-page'
import { Analyzer } from '@/components/analyzer'

export default function HomePage() {
  return (
    <>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <Analyzer />
      </SignedIn>
    </>
  )
}
