"use client";

import { ClerkProvider } from "@clerk/nextjs";
import React from "react";

export function ClerkProviderClient({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}
