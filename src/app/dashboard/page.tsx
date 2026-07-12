import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AssetManager from "@/components/AssetManager";

export default async function DashboardPage() {
  const session = await auth();

  // Route protection happens on the server. An unauthenticated request never
  // receives the page at all — this is not a client-side redirect that could
  // be bypassed by disabling JavaScript.
  if (!session?.user?.id) redirect("/login");

  // Data is fetched directly in the Server Component: no API round-trip, no
  // loading state, and the database credentials never reach the browser.
  const assets = await prisma.asset.findMany({
    where: { userId: session.user.id },
    include: { checks: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  type CheckRow = { status: string };
  type AssetRow = { checks: CheckRow[] };

  const allChecks = (assets as AssetRow[]).flatMap((a) => a.checks);
  const stats = {
    assets: assets.length,
    compliant: allChecks.filter((c) => c.status === "COMPLIANT").length,
    nonCompliant: allChecks.filter((c) => c.status === "NON_COMPLIANT").length,
    inReview: allChecks.filter((c) => c.status === "IN_REVIEW").length,
  };

  return (
    <>
      <nav className="nav">
        <span className="nav-brand">Compliance Tracker</span>
        <div className="row">
          <span className="muted">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="secondary" type="submit">Sign out</button>
          </form>
        </div>
      </nav>

      <main className="container">
        <div className="stat-grid">
          <div className="card stat">
            <div className="stat-value">{stats.assets}</div>
            <div className="stat-label">Assets</div>
          </div>
          <div className="card stat">
            <div className="stat-value" style={{ color: "var(--ok)" }}>{stats.compliant}</div>
            <div className="stat-label">Compliant</div>
          </div>
          <div className="card stat">
            <div className="stat-value" style={{ color: "var(--bad)" }}>{stats.nonCompliant}</div>
            <div className="stat-label">Non-compliant</div>
          </div>
          <div className="card stat">
            <div className="stat-value" style={{ color: "var(--warn)" }}>{stats.inReview}</div>
            <div className="stat-label">In review</div>
          </div>
        </div>

        {/* Server-fetched data is handed to a Client Component, which owns the
            interactive parts (forms, buttons). This is the standard App Router
            split: fetch on the server, interact on the client. */}
        <AssetManager initialAssets={JSON.parse(JSON.stringify(assets))} />
      </main>
    </>
  );
}
