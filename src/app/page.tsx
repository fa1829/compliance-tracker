import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  // Server Component: the session is read on the server, so an authenticated
  // visitor is redirected before any HTML is sent to the browser.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="auth-wrap">
      <h1 style={{ marginBottom: "0.5rem" }}>Compliance Tracker</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>
        Track infrastructure assets and their compliance status against security
        frameworks such as PCI-DSS and ISO 27001.
      </p>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Link href="/login"><button>Sign in</button></Link>
        <Link href="/register"><button className="secondary">Create account</button></Link>
      </div>
    </div>
  );
}
