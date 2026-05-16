import { Router } from "express";
import { getPayrollEvents, getTaxEvents } from "./indexer";
import { rpc as StellarRpc, xdr, Address } from "@stellar/stellar-sdk";

const router = Router();
const CONTRACT_ID = process.env.CONTRACT_ID ?? "";
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
    if (!CONTRACT_ID) {
      return res.status(503).json({ error: "CONTRACT_ID not configured" });
    }

    const contractAddress = new Address(CONTRACT_ID);
    const employerAddress = new Address(employer);

    // Encode the storage key: DataKey::ViewingKey(employer)
    const key = xdr.ScVal.scvVec([
      xdr.ScVal.scvSymbol("ViewingKey"),
      employerAddress.toScVal(),
    ]);

    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contractAddress.toScAddress(),
        key,
        durability: xdr.ContractDataDurability.persistent(),
      })
    );

    const result = await server.getLedgerEntries(ledgerKey);
    if (!result.entries || result.entries.length === 0) {
      return res.json({ employer, encryptedKey: null });
    }

    const entry = result.entries[0].val
      .contractData()
      .val()
      .bytes()
      ?.toString("base64");

    res.json({ employer, encryptedKey: entry ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
