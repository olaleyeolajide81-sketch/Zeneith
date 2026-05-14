/**
 * useProver — client-side Noir WASM proof generation hook.
 * All witness data stays in the browser; only the proof + commitment leave.
 */
"use client";

import { useState, useCallback } from "react";

export interface PayrollWitness {
  salaries: number[];       // private: individual amounts
  blindingFactors: string[]; // private: Pedersen blinding factors
  activeCount: number;
  totalAmount: number;
}

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
  commitment: string;
}

export function useProver() {
  const [proving, setProving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePayrollProof = useCallback(async (witness: PayrollWitness): Promise<ProofResult | null> => {
    setProving(true);
    setError(null);
    try {
      // Dynamically import WASM to avoid SSR issues
      const { Noir } = await import("@noir-lang/noir_js");
      const { BarretenbergBackend } = await import("@noir-lang/backend_barretenberg");
      const circuit = await import("../../circuits/target/zeneith_payroll.json");

      // Pad salaries to MAX_EMPLOYEES = 50
      const padded = [...witness.salaries];
      while (padded.length < 50) padded.push(0);
      const paddedBlinding = [...witness.blindingFactors];
      while (paddedBlinding.length < 50) paddedBlinding.push("0x00");

      const backend = new BarretenbergBackend(circuit as any);
      const noir = new Noir(circuit as any, backend);

      const { witness: w } = await noir.execute({
        salaries: padded,
        blinding_factors: paddedBlinding,
        active_count: witness.activeCount,
        total_amount: witness.totalAmount,
        salary_commitment: "0x00", // computed by circuit
      });

      const { proof, publicInputs } = await backend.generateProof(w);

      return {
        proof,
        publicInputs,
        commitment: publicInputs[1] ?? "0x00",
      };
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setProving(false);
    }
  }, []);

  return { generatePayrollProof, proving, error };
}
