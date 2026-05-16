/**
 * useProver — client-side Noir WASM proof generation hook.
 * All witness data stays in the browser; only the proof + commitment leave.
 *
 * Curve: BLS12-381 (matches Soroban CAP-0080 host functions).
 *
 * IMPORTANT: Replace circuits/target/zeneith_payroll.json with the real
 * compiled artifact by running `nargo build` in zeneith-contracts/circuits/.
 */
"use client";

import { useState, useCallback } from "react";

export interface PayrollWitness {
  salaries: number[];
  blindingFactors: string[];
  activeCount: number;
  totalAmount: number;
}

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
  /** Pedersen commitment to the salary vector — computed by the circuit */
  commitment: string;
}

export function useProver() {
  const [proving, setProving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePayrollProof = useCallback(async (witness: PayrollWitness): Promise<ProofResult | null> => {
    setProving(true);
    setError(null);
    try {
      const { Noir } = await import("@noir-lang/noir_js");
      const { BarretenbergBackend } = await import("@noir-lang/backend_barretenberg");
      const circuit = await import("../../circuits/target/zeneith_payroll.json");

      // Pad to MAX_EMPLOYEES = 50
      const padded = [...witness.salaries];
      while (padded.length < 50) padded.push(0);
      const paddedBlinding = [...witness.blindingFactors];
      while (paddedBlinding.length < 50) paddedBlinding.push("0x00");

      const backend = new BarretenbergBackend(circuit as any);
      const noir = new Noir(circuit as any, backend);

      const inputs = {
        salaries: padded,
        blinding_factors: paddedBlinding,
        active_count: witness.activeCount,
        total_amount: witness.totalAmount,
      };

      // Pass 1: execute with a dummy commitment to extract the real computed value.
      // The circuit constrains salary_commitment == pedersen(salaries||blindings).x,
      // so we need the circuit's own computed value before we can prove.
      const { witness: w1 } = await noir.execute({ ...inputs, salary_commitment: "0x00" });

      // Extract the real commitment from the solved witness (public input index 1).
      // noir_js exposes solved witness values via the return from execute.
      // publicInputs are the public parameters in declaration order: [total_amount, salary_commitment]
      const { proof: dryProof, publicInputs: dryPublicInputs } = await backend.generateProof(w1);
      const realCommitment = dryPublicInputs[1] ?? dryPublicInputs[0] ?? "0x00";

      // Pass 2: re-execute and prove with the correct commitment so the circuit assertion passes.
      const { witness: w2 } = await noir.execute({ ...inputs, salary_commitment: realCommitment });
      const { proof, publicInputs } = await backend.generateProof(w2);

      return { proof, publicInputs, commitment: realCommitment };
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setProving(false);
    }
  }, []);

  return { generatePayrollProof, proving, error };
}
