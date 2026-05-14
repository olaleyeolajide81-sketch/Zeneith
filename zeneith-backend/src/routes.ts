import { Router } from "express";
import { getPayrollEvents, getTaxEvents } from "./indexer";
import { rpc as StellarRpc } from "@stellar/stellar-sdk";

const router = Router();
const server = new StellarRpc.Server(
  process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org"
);

// GET /payroll — list all indexed payroll commitments (no salary data)
router.get("/payroll", (_req, res) => {
  res.json(getPayrollEvents());
});

// GET /tax — list all indexed tax compliance proofs
router.get("/tax", (_req, res) => {
  res.json(getTaxEvents());
});

// GET /dashboard — aggregate stats (total wages, total taxes — no individual data)
router.get("/dashboard", (_req, res) => {
  const payrolls = getPayrollEvents();
  const taxes = getTaxEvents();
  res.json({
    totalWagesPaid: payrolls.reduce((s, e) => s + BigInt(e.totalAmount), 0n).toString(),
    totalPayrollBatches: payrolls.length,
    totalTaxProofs: taxes.length,
    totalTaxPaid: taxes.reduce((s, e) => s + BigInt(e.taxPaid), 0n).toString(),
  });
});

// GET /viewing-key/:employer — retrieve encrypted viewing key from contract
router.get("/viewing-key/:employer", async (req, res) => {
  try {
    const { employer } = req.params;
    // Fetch from contract storage via RPC getLedgerEntries
    // Simplified: return placeholder until contract is deployed
    res.json({ employer, encryptedKey: null, message: "Key lookup requires deployed contract" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
