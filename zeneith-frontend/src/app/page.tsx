"use client";

import { useState } from "react";
import { useProver } from "@/hooks/useProver";
import { submitPayrollProof } from "@/lib/stellar";
import { Keypair } from "@stellar/stellar-sdk";

export default function PayrollPage() {
  const { generatePayrollProof, proving, error } = useProver();
  const [salariesInput, setSalariesInput] = useState("1000,2000,3000");
  const [secretKey, setSecretKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setTxHash(null);

    const salaries = salariesInput.split(",").map(Number);
    const totalAmount = salaries.reduce((a, b) => a + b, 0);
    const blindingFactors = salaries.map((_, i) => `0x0${i + 1}`);

    setStatus("Generating ZK proof in browser…");
    const proofResult = await generatePayrollProof({
      salaries,
      blindingFactors,
      activeCount: salaries.length,
      totalAmount,
    });

    if (!proofResult) return;

    setStatus("Submitting proof to Soroban…");
    try {
      let keypair: Keypair;
      try {
        keypair = Keypair.fromSecret(secretKey.trim());
      } catch {
        setStatus("Error: invalid secret key (S...)");
        return;
      }

      const result = await submitPayrollProof(
        keypair,
        proofResult.proof,
        proofResult.commitment,
        BigInt(totalAmount),
        salaries.length,
        proofResult.publicInputs,
      );

      setTxHash(result.hash);
      setStatus(`✓ Proof submitted on-chain. Commitment: ${proofResult.commitment.slice(0, 18)}…`);
    } catch (err: any) {
      setStatus(`Submission error: ${err.message}`);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>Zeneith — Shielded Payroll</h1>
      <p>All salary data stays in your browser. Only the ZK proof is sent on-chain.</p>

      <form onSubmit={handleSubmit}>
        <label>
          Salaries (comma-separated, in stroops)
          <br />
          <input
            value={salariesInput}
            onChange={(e) => setSalariesInput(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <br /><br />
        <label>
          Employer Secret Key (S…)
          <br />
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <br /><br />
        <button type="submit" disabled={proving || !secretKey}>
          {proving ? "Generating proof…" : "Generate & Submit Proof"}
        </button>
      </form>

      {error && <p style={{ color: "red" }}>Prover error: {error}</p>}
      {status && <p style={{ color: status.startsWith("✓") ? "green" : "#555" }}>{status}</p>}
      {txHash && (
        <p>
          Transaction:{" "}
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            {txHash.slice(0, 16)}…
          </a>
        </p>
      )}

      <hr />
      <section>
        <h2>Public Dashboard</h2>
        <p>Aggregate economic impact data will appear here (total wages, taxes — no individual data).</p>
      </section>
    </main>
  );
}
