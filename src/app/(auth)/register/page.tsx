"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    };

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    // Registration succeeded — sign the user straight in rather than making
    // them re-enter the credentials they just typed.
    await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="auth-wrap">
      <h1 style={{ marginBottom: "1.5rem" }}>Create account</h1>
      <form onSubmit={handleSubmit}>
        {error && <p className="error">{error}</p>}

        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required autoComplete="name" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />

        <label htmlFor="password">Password</label>
        <input
          id="password" name="password" type="password" required
          minLength={8} autoComplete="new-password"
        />
        <p className="muted" style={{ marginTop: "-0.75rem", marginBottom: "1rem" }}>
          At least 8 characters.
        </p>

        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="muted" style={{ marginTop: "1.5rem" }}>
        Already registered? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
