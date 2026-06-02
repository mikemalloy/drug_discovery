import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import LandingPage from '@/components/LandingPage';

vi.mock('@clerk/clerk-react', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LandingPage', () => {
  it('renders the app title', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('heading', { name: /Drug Discovery Platform/i })
    ).toBeInTheDocument();
  });

  it('renders a Sign In button', () => {
    render(<LandingPage />);
    expect(
      screen.getByRole('button', { name: /Sign In/i })
    ).toBeInTheDocument();
  });

  it('renders 12 Tox21 Endpoints feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/12 Tox21 Endpoints/i)).toBeInTheDocument();
  });

  it('renders ADMET Profiling feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/ADMET Profiling/i)).toBeInTheDocument();
  });

  it('renders Risk Scoring feature card', () => {
    render(<LandingPage />);
    expect(screen.getByText(/Risk Scoring/i)).toBeInTheDocument();
  });
});
