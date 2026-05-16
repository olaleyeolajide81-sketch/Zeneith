import {
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  rpc as StellarRpc,
  Keypair,
  xdr,
  Address,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
  ? Networks.PUBLIC
  : Networks.TESTNET;

const server = new StellarRpc.Server(RPC_URL);

/** Pad or truncate a hex string to exactly 32 bytes (64 hex chars). */
function toBytes32(hex: string): Buffer {
  const clean = hex.replace(/^0x/, "").padStart(64, "0").slice(0, 64);
  return Buffer.from(clean, "hex");
}

export async function submitPayrollProof(
  employerKeypair: Keypair,
  proof: Uint8Array,
  commitment: string,
  totalAmount: bigint,
  employeeCount: number,
  publicInputs: string[],
) {
  const account = await server.getAccount(employerKeypair.publicKey());
  const contract = new Contract(CONTRACT_ID);

  // Build Vec<BytesN<32>> for public_inputs
  const inputScVals = publicInputs.map((pi) =>
    xdr.ScVal.scvBytes(toBytes32(pi))
  );

  const employerAddress = new Address(employerKeypair.publicKey());

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(
      contract.call(
        "submit_payroll",
        employerAddress.toScVal(),
        xdr.ScVal.scvBytes(Buffer.from(proof)),
        xdr.ScVal.scvVec(inputScVals),
        xdr.ScVal.scvBytes(toBytes32(commitment)),
        xdr.ScVal.scvU64(xdr.Uint64.fromString(totalAmount.toString())),
        xdr.ScVal.scvU32(employeeCount),
      )
    )
    .setTimeout(30)
    .build();

  const prepared = await server.prepareTransaction(tx);
  prepared.sign(employerKeypair);
  return server.sendTransaction(prepared);
}
