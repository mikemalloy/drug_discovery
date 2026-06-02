'use client';

import { useState, useRef, useEffect } from 'react';
import type { AnalyzeResponse } from '@/types/report';

type Status = 'idle' | 'loading' | 'done' | 'error';

const STEPS = [
  'Validating SMILES',
  'Computing toxicity scores',
  'Computing explainability',
  'Generating report',
] as const;

// Cumulative ms from analyze click at which each step advance fires
const STEP_TIMINGS = [5_000, 20_000, 65_000];

const TARGET_ORDER = [
  'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
  'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
  'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
];

const TIER_STYLES: Record<string, string> = {
  Low: 'bg-green-100 text-green-800',
  Moderate: 'bg-amber-100 text-amber-800',
  High: 'bg-red-100 text-red-800',
};

interface CardProps {
  status: Status;
  report: AnalyzeResponse | null;
  errorMessage: string;
  stepIndex: number;
  onRetry: () => void;
}

export default function Analyzer() {
  const [smiles, setSmiles] = useState('');
  const [compoundName, setCompoundName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  const handleAnalyze = async () => {
    if (!smiles.trim() || status === 'loading') return;

    setStatus('loading');
    setStepIndex(0);
    setReport(null);
    setErrorMessage('');
    clearTimers();

    STEP_TIMINGS.forEach((delay, i) => {
      const t = setTimeout(() => setStepIndex(i + 1), delay);
      timersRef.current.push(t);
    });

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/analyze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ smiles: smiles.trim(), compound_name: compoundName }),
        }
      );

      clearTimers();

      if (response.status === 422) {
        setStatus('error');
        setErrorMessage('Invalid SMILES string — please check your input.');
        return;
      }
      if (!response.ok) {
        setStatus('error');
        setErrorMessage('Could not reach the analysis server.');
        return;
      }

      const data: AnalyzeResponse = await response.json();
      setReport(data);
      setStatus('done');
    } catch {
      clearTimers();
      setStatus('error');
      setErrorMessage('Could not reach the analysis server.');
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setReport(null);
    setErrorMessage('');
    setStepIndex(0);
  };

  return (
    <div className="grid grid-cols-[2fr_3fr] h-full">
      {/* Left panel */}
      <div className="border-r border-gray-200 bg-white p-6 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            SMILES notation
          </label>
          <textarea
            rows={3}
            value={smiles}
            onChange={e => setSmiles(e.target.value)}
            disabled={status === 'loading'}
            placeholder="CC(=O)Oc1ccccc1C(=O)O"
            className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Compound name{' '}
            <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={compoundName}
            onChange={e => setCompoundName(e.target.value)}
            disabled={status === 'loading'}
            placeholder="Aspirin"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!smiles.trim() || status === 'loading'}
          className="w-full px-4 py-2 bg-blue-800 text-white rounded-md text-sm font-medium hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {/* Right column */}
      <div className="bg-gray-50 p-6 flex flex-col gap-4 overflow-y-auto">
        <SafetySummaryCard
          status={status}
          report={report}
          errorMessage={errorMessage}
          stepIndex={stepIndex}
          onRetry={handleRetry}
        />
        <ToxicityProfileCard
          status={status}
          report={report}
          errorMessage={errorMessage}
          stepIndex={stepIndex}
          onRetry={handleRetry}
        />
      </div>
    </div>
  );
}

// ── Progress Steps ──────────────────────────────────────────────────────────

function ProgressSteps({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="py-4 px-2 flex flex-col gap-3">
      {STEPS.map((label, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={label} className="flex items-center gap-3">
            {done ? (
              <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs flex-shrink-0">
                ✓
              </span>
            ) : active ? (
              <span className="w-5 h-5 rounded-full border-2 border-blue-800 border-t-transparent animate-spin flex-shrink-0" />
            ) : (
              <span className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0" />
            )}
            <span
              className={`text-sm ${
                done
                  ? 'text-green-700'
                  : active
                  ? 'text-blue-800 font-medium'
                  : 'text-gray-400'
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Error Display ───────────────────────────────────────────────────────────

function ErrorDisplay({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-4 text-center">
      <p className="text-sm text-red-600 mb-3">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── Safety Summary Card ─────────────────────────────────────────────────────

function SafetySummaryCard({
  status,
  report,
  errorMessage,
  stepIndex,
  onRetry,
}: CardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Safety Summary
      </h2>
      {status === 'idle' && (
        <p className="text-sm text-gray-400">
          Enter a SMILES string and click Analyze.
        </p>
      )}
      {status === 'loading' && <ProgressSteps stepIndex={stepIndex} />}
      {status === 'error' && (
        <ErrorDisplay message={errorMessage} onRetry={onRetry} />
      )}
      {status === 'done' && report && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                TIER_STYLES[report.risk_summary.tier] ?? 'bg-gray-100 text-gray-800'
              }`}
            >
              {report.risk_summary.tier} Risk
            </span>
            <span className="text-sm text-gray-500">
              Score: {report.risk_summary.composite_score.toFixed(2)}
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(
                [
                  ['Molecular Weight', report.admet.molecular_weight.toFixed(2)],
                  ['LogP', report.admet.logp.toFixed(2)],
                  ['HBD', String(report.admet.hbd)],
                  ['HBA', String(report.admet.hba)],
                  ['TPSA', report.admet.tpsa.toFixed(1)],
                  ['Rotatable Bonds', String(report.admet.rotatable_bonds)],
                  ['Lipinski', report.admet.lipinski_pass ? '✓ Pass' : '✗ Fail'],
                  ['Veber', report.admet.veber_pass ? '✓ Pass' : '✗ Fail'],
                  [
                    'PAINS Alerts',
                    report.admet.pains_alerts.length === 0
                      ? 'None'
                      : report.admet.pains_alerts.join(', '),
                  ],
                ] as [string, string][]
              ).map(([label, value]) => (
                <tr key={label} className="border-t border-gray-100">
                  <td className="py-1.5 pr-4 text-gray-500 font-medium w-1/2">
                    {label}
                  </td>
                  <td className="py-1.5 text-gray-800">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Toxicity Profile Card ───────────────────────────────────────────────────

function ToxicityProfileCard({
  status,
  report,
  errorMessage,
  stepIndex,
  onRetry,
}: CardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Toxicity Profile
      </h2>
      {status === 'idle' && (
        <p className="text-sm text-gray-400">Results will appear here.</p>
      )}
      {status === 'loading' && <ProgressSteps stepIndex={stepIndex} />}
      {status === 'error' && (
        <ErrorDisplay message={errorMessage} onRetry={onRetry} />
      )}
      {status === 'done' && report && (
        <div className="flex flex-col gap-4">
          <div
            className="max-w-[200px] mx-auto"
            dangerouslySetInnerHTML={{ __html: report.structure_svg }}
          />
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-1.5 text-left text-gray-500 font-medium">
                  Target
                </th>
                <th className="py-1.5 text-right text-gray-500 font-medium">
                  Probability
                </th>
                <th className="py-1.5 text-right text-gray-500 font-medium">
                  Label
                </th>
              </tr>
            </thead>
            <tbody>
              {TARGET_ORDER.map(target => {
                const t = report.toxicity[target];
                if (!t) return null;
                const toxic = t.label === 'toxic';
                return (
                  <tr
                    key={target}
                    className={`border-t border-gray-100 ${
                      toxic ? 'bg-red-50' : ''
                    }`}
                  >
                    <td className="py-1.5 pr-4 text-gray-700">{target}</td>
                    <td className="py-1.5 text-right text-gray-700">
                      {t.probability.toFixed(2)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-medium ${
                        toxic ? 'text-red-700' : 'text-green-700'
                      }`}
                    >
                      {t.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
