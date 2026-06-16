'use client'
import { useState } from 'react'
import { LandingPage } from '@/components/landing-page'
import { Analyzer } from '@/components/analyzer'
import { HumanCheck } from '@/components/human-check'

export default function Home() {
  const [verified, setVerified] = useState(false)
  const [showCheck, setShowCheck] = useState(false)
  return (
    <>
      {verified ? <Analyzer /> : <LandingPage onGetStarted={() => setShowCheck(true)} />}
      <HumanCheck open={showCheck} onClose={() => setShowCheck(false)} onVerified={() => { setVerified(true); setShowCheck(false) }} />
    </>
  )
}
