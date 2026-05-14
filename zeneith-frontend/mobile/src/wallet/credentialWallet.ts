/**
 * Credential Wallet — stores ZK identity proofs in device secure storage.
 * Employees can prove employment without revealing salary or wallet address.
 */
import * as SecureStore from "expo-secure-store";

export interface IdentityProof {
  id: string;
  employerCommitment: string; // public commitment to employer identity
  proof: string;              // hex-encoded ZK proof
  publicInputs: string[];
  issuedAt: number;
  expiresAt: number;
}

const STORE_KEY = "zeneith_identity_proofs";

async function load(): Promise<IdentityProof[]> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function save(proofs: IdentityProof[]) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(proofs));
}

export async function storeProof(proof: IdentityProof) {
  const proofs = await load();
  proofs.push(proof);
  await save(proofs);
}

export async function listProofs(): Promise<IdentityProof[]> {
  return load();
}

export async function deleteProof(id: string) {
  const proofs = await load();
  await save(proofs.filter((p) => p.id !== id));
}

/** Returns true if proof is still valid (not expired) */
export function isValid(proof: IdentityProof): boolean {
  return Date.now() < proof.expiresAt;
}
