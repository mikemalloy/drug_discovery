'use client';

// ClerkProvider from @clerk/clerk-react is purely client-side (no Server Actions).
// @clerk/nextjs's ClerkProvider pulls in server-side cache-invalidation actions
// that conflict with Next.js output: 'export' (static S3 deployment).
import { ClerkProvider } from '@clerk/clerk-react';
import type { ReactNode } from 'react';

export default function ClerkClientProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}>
      {children}
    </ClerkProvider>
  );
}
