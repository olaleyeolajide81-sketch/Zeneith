"use client";

import { useState } from "react";
import { useProver } from "@/hooks/useProver";

export default function PayrollPage() {
  const { generatePayrollProof, proving, error } = useProver();
  const [salariesInput, setSalariesInput] = useState("1000,2000,3000");
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const salaries = salariesInput.split(",").map(Number);
    const totalAmount = salaries.reduce((a, b) => a + b, 0);
    const blindingFactors = salaries.map((_, i) => `0x0${i + 1}`);

    const proof = await generatePayrollProof({
      salaries,
      blindingFactors,
      activeCount: salaries.length,
      totalAmount,
    });

    if (proof) {
      setResult(`Proof generated. Commitment: ${proof.commitment}`);
      // TODO: call submitPayrollProof(keypair, proof.proof, proof.commitment, BigInt(totalAmount), salaries.length)
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>Zeneith — Shielded Payroll</h1>
      <p>All salary data stays in your browser. Only the ZK proof is sent on-chain.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Salaries (comma-separated, in XLM stroops)
          <br />
          <input
            value={salariesInput}
            onChange={(e) => setSalariesInput(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <br /><br />
        <button type="submit" disabled={proving}>
          {proving ? "Generating proof…" : "Generate & Submit Proof"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {result && <p style={{ color: "green" }}>{result}</p>}

      <hr />
      <section>
        <h2>Public Dashboard</h2>
        <p>Aggregate economic impact data will appear here (total wages, taxes — no individual data).</p>
      </section>
    </main>
  );
}
