"use client";

import { SessionProvider } from "next-auth/react";

// SessionProvider makes the session available to Client Components via
// useSession(). Server Components use auth() directly and do not need this.
export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
