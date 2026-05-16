# Zeneith

**Zero-Knowledge Payroll & Compliance Layer on Stellar**

> Confidential Enterprise Settlement via Protocol 26 BLS12-381 Host Functions.

Zeneith lets businesses settle payroll and invoices with full confidentiality. Individual salary amounts never touch the blockchain — only a ZK proof and a cryptographic commitment do.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Noir WASM Prover  ←  salary witness (stays here)   │   │
│  │  generates Groth16 proof + Pedersen commitment       │   │
│  └──────────────────┬───────────────────────────────────┘   │
└─────────────────────┼───────────────────────────────────────┘
                      │ proof + commitment only
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Stellar / Soroban (Protocol 26)                            │
│  ZeneithPayroll contract                                    │
│  • verify_groth16_proof (CAP-0080 bls12_381 pairing_check) │
│  • store PayrollRecord (commitment, total, count)           │
│  • register_viewing_key (selective disclosure)              │
└─────────────────────┬───────────────────────────────────────┘
                      │ events
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Backend                                            │
│  • Stellar RPC event indexer (polls every 5s)              │
│  • REST API: /payroll /tax /dashboard /viewing-key         │
└─────────────────────────────────────────────────────────────┘

Mobile (Expo)
• Credential Wallet — stores ZK employment proofs (SecureStore)
• Employees prove employment without revealing salary/address
```

## Components

| Path | Description |
|------|-------------|
| `zeneith-contracts/circuits/` | Noir ZK circuits — payroll sum proof + tax compliance proof (BLS12-381) |
| `zeneith-contracts/soroban/` | Soroban smart contract (Rust) — on-chain Groth16 verifier via CAP-0080 |
| `zeneith-frontend/` | Next.js 14 — client-side WASM prover, payroll UI, auditor key UI |
| `zeneith-frontend/mobile/` | Expo React Native — ZK credential wallet |
| `zeneith-backend/` | Express + TypeScript — Stellar event indexer, REST API |

## Quick Start

### Prerequisites
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) ≥ 0.36
- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
- Node.js ≥ 20, Yarn

### 1. ZK Circuits
```bash
cd zeneith-contracts/circuits
nargo build          # compiles circuit → target/zeneith_payroll.json
nargo execute        # generates witness (prints salary_commitment value)
nargo prove          # generates test proof
nargo verify         # verifies test proof
```

> After `nargo build`, copy `target/zeneith_payroll.json` into
> `zeneith-frontend/` so the WASM prover can load it:
> ```bash
> cp zeneith-contracts/circuits/target/zeneith_payroll.json \
>    zeneith-frontend/circuits/target/zeneith_payroll.json
> ```

### 2. Smart Contract
```bash
cd zeneith-contracts/soroban
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/zeneith_contracts.wasm \
  --network testnet \
  --source <YOUR_ACCOUNT>
```

After deploying, initialize the contract with the verifying key extracted from `bb write_vk`:
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <YOUR_ACCOUNT> \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --vk "$(cat verifying_key.json)"
```

### 3. Backend
```bash
cp .env.example .env   # fill in CONTRACT_ID and STELLAR_RPC_URL
cd zeneith-backend && yarn install && yarn dev
```

### 4. Frontend
```bash
cd zeneith-frontend && yarn install && yarn dev
# open http://localhost:3000
```

### 5. Mobile
```bash
cd zeneith-frontend/mobile && yarn install && yarn start
```

## Key Flows

**Shielded Payroll**
1. Employer enters salaries in browser → WASM prover generates Groth16 proof locally (BLS12-381)
2. Only `(proof, commitment, total)` sent to Soroban contract
3. Contract verifies proof on-chain via `bls12_381.pairing_check` (CAP-0080), stores `PayrollRecord`
4. Backend indexes the event; dashboard shows aggregate totals

**Auditor Viewing Key**
1. Employer calls `register_viewing_key` with an encrypted key
2. Auditor fetches key via `/viewing-key/:employer` (requires employer auth on-chain)
3. Auditor decrypts off-chain to view individual line items

**ZK Tax Compliance**
1. Employer generates compliance proof (tax_paid ≥ gross × rate)
2. Proof submitted via `submit_tax_proof` — gross amount never revealed

## Cryptographic Design

| Layer | Curve | Scheme |
|-------|-------|--------|
| Noir circuit | BLS12-381 | Groth16 |
| Soroban verifier | BLS12-381 | `pairing_check` (CAP-0080) |
| Commitment | BLS12-381 | Pedersen (Noir stdlib) |

The verifying key is embedded in the contract at initialization time via the `VerifyingKey` struct (alpha_g1, beta_g2, gamma_g2, delta_g2, IC points). Proof format: `pi_a (96B) || pi_b (192B) || pi_c (96B)` = 384 bytes.

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|----------|-------------|
| `STELLAR_RPC_URL` | Soroban RPC endpoint |
| `CONTRACT_ID` | Deployed ZeneithPayroll contract address |
| `NEXT_PUBLIC_CONTRACT_ID` | Same, exposed to frontend |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` |

## License

MIT
