'use client';

import { SignInButton } from '@clerk/clerk-react';

export default function LandingPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-white px-6 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">
          Drug Discovery Platform
        </h1>
        <p className="text-lg text-gray-500 mb-8">
          AI-powered compound toxicity screening
        </p>
        <SignInButton mode="modal">
          <button className="bg-blue-800 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg text-base transition-colors">
            Sign In to Get Started
          </button>
        </SignInButton>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl w-full">
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">12 Tox21 Endpoints</h2>
          <p className="text-sm text-gray-500">
            Predicts toxicity across nuclear receptor and stress response pathways
            including NR-AR, NR-AhR, and SR-p53.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">ADMET Profiling</h2>
          <p className="text-sm text-gray-500">
            Computes Lipinski, Veber, and PAINS rules alongside molecular weight,
            LogP, TPSA, and rotatable bonds.
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-2">Risk Scoring &amp; Structure Visualization</h2>
          <p className="text-sm text-gray-500">
            Composite risk tier (Low / Moderate / High) with 2D molecular structure
            rendered from SMILES.
          </p>
        </div>
      </div>
    </main>
  );
}
