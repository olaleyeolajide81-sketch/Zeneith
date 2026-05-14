import { rpc as StellarRpc } from "@stellar/stellar-sdk";

const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.CONTRACT_ID ?? "";

const server = new StellarRpc.Server(RPC_URL);

export interface PayrollEvent {
  commitment: string;
  totalAmount: string;
  employeeCount: number;
  ledger: number;
  timestamp: number;
}

export interface TaxEvent {
  commitment: string;
  taxPaid: string;
  taxRateBps: number;
  ledger: number;
}

// In-memory store (replace with DB in production)
const payrollEvents: PayrollEvent[] = [];
const taxEvents: TaxEvent[] = [];
let lastLedger = 0;

export async function startIndexer() {
  console.log(`[indexer] Watching contract ${CONTRACT_ID}`);
  setInterval(poll, 5000);
}

async function poll() {
  try {
    const { events } = await server.getEvents({
      startLedger: lastLedger || undefined,
      filters: [
        {
          type: "contract",
          contractIds: [CONTRACT_ID],
          topics: [["*"]],
        },
      ],
      limit: 100,
    });

    for (const event of events) {
      lastLedger = Math.max(lastLedger, event.ledger);
      const topic = event.topic[0]?.value();
      if (topic === "payroll") {
        payrollEvents.push({
          commitment: String(event.value.value()),
          totalAmount: String(event.topic[2]?.value() ?? 0),
          employeeCount: Number(event.topic[3]?.value() ?? 0),
          ledger: event.ledger,
          timestamp: event.ledgerClosedAt ? new Date(event.ledgerClosedAt).getTime() : Date.now(),
        });
      } else if (topic === "tax") {
        taxEvents.push({
          commitment: String(event.value.value()),
          taxPaid: String(event.topic[2]?.value() ?? 0),
          taxRateBps: Number(event.topic[3]?.value() ?? 0),
          ledger: event.ledger,
        });
      }
    }
  } catch (e) {
    // RPC may be unavailable in dev; silently retry
  }
}

export function getPayrollEvents() { return payrollEvents; }
export function getTaxEvents() { return taxEvents; }
