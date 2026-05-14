"use client";

import { useState } from "react";

export default function ViewingKeyPage() {
  const [employer, setEmployer] = useState("");
  const [key, setKey] = useState<string | null>(null);

  async function fetchKey() {
    const res = await fetch(`/api/viewing-key?employer=${employer}`);
    const data = await res.json();
    setKey(data.encryptedKey ?? "Not found");
  }

  return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>Auditor Viewing Key</h1>
      <p>Enter an employer address to retrieve their encrypted viewing key (requires auditor authorization).</p>
      <input
        placeholder="G... Stellar address"
        value={employer}
        onChange={(e) => setEmployer(e.target.value)}
        style={{ width: "100%", padding: 8 }}
      />
      <br /><br />
      <button onClick={fetchKey}>Fetch Viewing Key</button>
      {key && <pre style={{ background: "#f4f4f4", padding: 12 }}>{key}</pre>}
    </main>
  );
}
