"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);

    // redirect: false lets us handle the error inline instead of bouncing to
    // an Auth.js error page.
    const res = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      // Deliberately generic: never reveal whether the email exists.
      setError("Invalid email or password");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <h1 style={{ marginBottom: "1.5rem" }}>Sign in</h1>
      <form onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />

        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: "1.5rem" }}>
        No account? <Link href="/register">Create one</Link>
      </p>
    </div>
  );
}
