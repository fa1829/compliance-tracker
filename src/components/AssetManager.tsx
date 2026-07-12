"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Check = {
  id: string;
  framework: string;
  status: "COMPLIANT" | "NON_COMPLIANT" | "IN_REVIEW" | "NOT_ASSESSED";
  notes: string | null;
};

type Asset = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  owner: string | null;
  checks: Check[];
};

const ASSET_TYPES = [
  "SERVER", "APPLICATION", "DATABASE",
  "NETWORK_DEVICE", "ENDPOINT", "CLOUD_RESOURCE",
];

const STATUSES = ["COMPLIANT", "NON_COMPLIANT", "IN_REVIEW", "NOT_ASSESSED"];

export default function AssetManager({ initialAssets }: { initialAssets: Asset[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  // After any mutation, router.refresh() re-runs the Server Component and
  // streams down fresh data. There is no client-side cache to keep in sync,
  // which is what makes this pattern simple: the server stays the source of truth.
  async function mutate(url: string, method: string, body?: unknown) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return false;
    }
    router.refresh();
    return true;
  }

  async function createAsset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Capture the form element BEFORE awaiting. React pools synthetic events and
    // nulls out `currentTarget` once the handler's synchronous phase ends, so
    // reading `e.currentTarget` after an `await` throws. Holding a direct
    // reference keeps the element available for the post-submit reset.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);

    const ok = await mutate("/api/assets", "POST", {
      name: form.get("name"),
      type: form.get("type"),
      description: form.get("description") || null,
      owner: form.get("owner") || null,
    });

    if (ok) {
      formEl.reset();
      setShowForm(false);
    }
  }

  async function addCheck(assetId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // Same reasoning as createAsset: keep a reference across the await boundary.
    const formEl = e.currentTarget;
    const form = new FormData(formEl);

    const ok = await mutate(`/api/assets/${assetId}/checks`, "POST", {
      framework: form.get("framework"),
      status: form.get("status"),
      notes: form.get("notes") || null,
    });

    if (ok) formEl.reset();
  }

  return (
    <section>
      <div className="row" style={{ marginBottom: "1rem" }}>
        <h2>Assets</h2>
        <button onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New asset"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <form className="card" onSubmit={createAsset}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required placeholder="e.g. prod-web-01" />

          <label htmlFor="type">Type</label>
          <select id="type" name="type" required defaultValue="SERVER">
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>

          <label htmlFor="owner">Owner</label>
          <input id="owner" name="owner" placeholder="e.g. Platform team" />

          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={2} />

          <button type="submit">Create asset</button>
        </form>
      )}

      {initialAssets.length === 0 && (
        <p className="muted">No assets yet. Create one to begin tracking compliance.</p>
      )}

      {initialAssets.map((asset) => (
        <div key={asset.id} className="card">
          <div className="row">
            <div>
              <strong>{asset.name}</strong>{" "}
              <span className="muted">· {asset.type.replace("_", " ")}</span>
              {asset.owner && <div className="muted">Owner: {asset.owner}</div>}
              {asset.description && <div className="muted">{asset.description}</div>}
            </div>
            <button
              className="danger"
              onClick={() => mutate(`/api/assets/${asset.id}`, "DELETE")}
            >
              Delete
            </button>
          </div>

          <div style={{ marginTop: "1rem" }}>
            {asset.checks.map((check) => (
              <div key={check.id} className="row" style={{ padding: "0.4rem 0" }}>
                <span>
                  <span className={`badge ${check.status}`}>
                    {check.status.replace("_", " ")}
                  </span>{" "}
                  {check.framework}
                  {check.notes && <span className="muted"> — {check.notes}</span>}
                </span>
                <button
                  className="secondary"
                  onClick={() => mutate(`/api/checks/${check.id}`, "DELETE")}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => addCheck(asset.id, e)}
            style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "start" }}
          >
            <input name="framework" placeholder="Control, e.g. PCI-DSS 8.3.4" required style={{ margin: 0 }} />
            <select name="status" defaultValue="NOT_ASSESSED" required style={{ margin: 0, maxWidth: 170 }}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
            <input name="notes" placeholder="Notes (optional)" style={{ margin: 0 }} />
            <button type="submit">Add</button>
          </form>
        </div>
      ))}
    </section>
  );
}
