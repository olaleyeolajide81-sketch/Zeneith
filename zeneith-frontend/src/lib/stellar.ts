import {
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  rpc as StellarRpc,
  Keypair,
  xdr,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? "";
const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
  ? Networks.PUBLIC
  : Networks.TESTNET;

const server = new StellarRpc.Server(RPC_URL);

export async function submitPayrollProof(
  employerKeypair: Keypair,
  proof: Uint8Array,
  commitment: string,
  totalAmount: bigint,
  employeeCount: number,
) {
  const account = await server.getAccount(employerKeypair.publicKey());
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(
      contract.call(
        "submit_payroll",
        xdr.ScVal.scvAddress(xdr.ScAddress.scAddressTypeAccount(
          xdr.AccountID.publicKeyTypeEd25519(
            Buffer.from(Keypair.fromPublicKey(employerKeypair.publicKey()).rawPublicKey())
          )
        )),
        xdr.ScVal.scvBytes(Buffer.from(proof)),
        xdr.ScVal.scvVec([
          xdr.ScVal.scvBytes(Buffer.from(commitment.replace("0x", ""), "hex")),
        ]),
        xdr.ScVal.scvBytes(Buffer.from(commitment.replace("0x", ""), "hex")),
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
