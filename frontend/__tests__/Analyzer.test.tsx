import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Analyzer from '@/components/Analyzer';

const mockFetch = vi.fn();

describe('Analyzer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ── Input panel ──────────────────────────────────────────────────────

  it('renders SMILES textarea and compound name input', () => {
    render(<Analyzer />);
    expect(
      screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O')
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Aspirin')).toBeInTheDocument();
  });

  it('disables Analyze button when SMILES is empty', () => {
    render(<Analyzer />);
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled();
  });

  it('enables Analyze button when SMILES is non-empty', () => {
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    expect(screen.getByRole('button', { name: /analyze/i })).not.toBeDisabled();
  });

  // ── Loading state ────────────────────────────────────────────────────

  it('shows "Analyzing…" on button and progress steps when loading', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(screen.getByRole('button', { name: /analyzing/i })).toBeDisabled();
    expect(screen.getAllByText('Validating SMILES').length).toBeGreaterThan(0);
  });

  it('advances to step 2 after 5 seconds', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    await act(async () => {
      vi.advanceTimersByTime(5001);
    });
    // 'Computing toxicity scores' is now the active step in both cards
    expect(screen.getAllByText('Computing toxicity scores').length).toBeGreaterThan(0);
  });
});
