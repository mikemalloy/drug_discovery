'use client';

import { SignedIn, SignedOut, UserButton } from '@clerk/clerk-react';
import Analyzer from '@/components/Analyzer';
import LandingPage from '@/components/LandingPage';

export default function Home() {
  return (
    <>
      <SignedOut>
        <LandingPage />
      </SignedOut>
      <SignedIn>
        <main className="flex-1 flex flex-col min-h-0">
          <header className="bg-blue-800 text-white px-6 py-4 flex-shrink-0 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Drug Discovery Platform</h1>
              <p className="text-sm text-blue-200 mt-0.5">
                AI-powered compound toxicity screening
              </p>
            </div>
            <UserButton />
          </header>
          <div className="flex-1 min-h-0">
            <Analyzer />
          </div>
        </main>
      </SignedIn>
    </>
  );
}
