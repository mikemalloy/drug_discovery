import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Analyzer from '@/components/Analyzer';
import { useAuth } from '@clerk/clerk-react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: vi.fn(() => ({ getToken: vi.fn().mockResolvedValue('test-token') })),
}));

const mockFetch = vi.fn();

const TARGET_NAMES = [
  'NR-AR', 'NR-AR-LBD', 'NR-AhR', 'NR-Aromatase',
  'NR-ER', 'NR-ER-LBD', 'NR-PPAR-gamma',
  'SR-ARE', 'SR-ATAD5', 'SR-HSE', 'SR-MMP', 'SR-p53',
];

const STUB_REPORT = {
  smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  canonical_smiles: 'CC(=O)Oc1ccccc1C(=O)O',
  compound_name: 'Aspirin',
  structure_svg: "<svg width='360' height='260'><text>stub</text></svg>",
  toxicity: Object.fromEntries(
    TARGET_NAMES.map(t => [t, { probability: 0.1, label: 'safe', threshold: 0.85 }])
  ),
  admet: {
    molecular_weight: 180.16,
    logp: 1.19,
    hbd: 1,
    hba: 3,
    tpsa: 63.6,
    rotatable_bonds: 3,
    lipinski_pass: true,
    veber_pass: true,
    pains_alerts: [],
  },
  explainability: {},
  risk_summary: {
    composite_score: 0.1,
    tier: 'Low',
    toxic_targets: [],
    flagged_targets: [],
  },
};

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

  // ── Done state ───────────────────────────────────────────────────────

  it('renders risk tier badge and composite score when done', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STUB_REPORT,
    });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC(=O)Oc1ccccc1C(=O)O' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(screen.getByText('Low Risk')).toBeInTheDocument();
    expect(screen.getByText('Score: 0.10')).toBeInTheDocument();
  });

  it('renders ADMET table with correct Molecular Weight', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STUB_REPORT,
    });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC(=O)Oc1ccccc1C(=O)O' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(screen.getByText('Molecular Weight')).toBeInTheDocument();
    expect(screen.getByText('180.16')).toBeInTheDocument();
    expect(screen.getAllByText('✓ Pass').length).toBe(2); // Lipinski + Veber both pass
  });

  it('renders all 12 toxicity targets in the profile card', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STUB_REPORT,
    });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC(=O)Oc1ccccc1C(=O)O' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    TARGET_NAMES.forEach(target => {
      expect(screen.getByText(target)).toBeInTheDocument();
    });
  });

  // ── Error handling ───────────────────────────────────────────────────

  it('shows invalid SMILES message in both cards on 422', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'not-smiles' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    // Error message appears in both cards
    expect(
      screen.getAllByText('Invalid SMILES string — please check your input.').length
    ).toBe(2);
  });

  it('shows server error message on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(
      screen.getAllByText('Could not reach the analysis server.').length
    ).toBe(2);
  });

  it('resets to idle state when Retry is clicked', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'invalid' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    // Click the first Retry button (one per card, both work)
    fireEvent.click(screen.getAllByRole('button', { name: /retry/i })[0]);
    expect(
      screen.getByText('Enter a SMILES string and click Analyze.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^analyze$/i })).toBeInTheDocument();
  });

  it('shows server error message on 500 response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(
      screen.getAllByText('Could not reach the analysis server.').length
    ).toBe(2);
  });

  it('both Retry buttons reset to idle state', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({}) });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'invalid' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBe(2);
    // Both buttons are wired to the same handleRetry — verify second also works
    fireEvent.click(screen.getAllByRole('button', { name: /retry/i })[1]);
    expect(screen.getByText('Enter a SMILES string and click Analyze.')).toBeInTheDocument();
  });

  // ── Auth ─────────────────────────────────────────────────────────────

  it('shows auth error in both cards when getToken returns null', async () => {
    vi.mocked(useAuth).mockReturnValueOnce({
      getToken: vi.fn().mockResolvedValue(null),
    } as ReturnType<typeof useAuth>);
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(
      screen.getAllByText('Authentication required — please sign in.').length
    ).toBe(2);
  });

  it('sends Authorization header with fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => STUB_REPORT,
    });
    render(<Analyzer />);
    fireEvent.change(screen.getByPlaceholderText('CC(=O)Oc1ccccc1C(=O)O'), {
      target: { value: 'CC(=O)Oc1ccccc1C(=O)O' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /analyze/i }));
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });
});
