# Zeneith

**Zero-Knowledge Payroll & Compliance Layer on Stellar**

> Confidential Enterprise Settlement via Protocol 26 BN254 Host Functions.

Zeneith lets businesses settle payroll and invoices with full confidentiality. Individual salary amounts never touch the blockchain — only a ZK proof and a cryptographic commitment do.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Noir WASM Prover  ←  salary witness (stays here)   │   │
│  │  generates proof + commitment                        │   │
│  └──────────────────┬───────────────────────────────────┘   │
└─────────────────────┼───────────────────────────────────────┘
                      │ proof + commitment only
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Stellar / Soroban (Protocol 26)                            │
│  ZeneithPayroll contract                                    │
│  • verify_bn254_proof (CAP-0080 bn254_g1_msm)              │
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
| `circuits/` | Noir ZK circuits — payroll sum proof + tax compliance proof |
| `contracts/` | Soroban smart contract (Rust) — on-chain BN254 proof verifier |
| `frontend/` | Next.js 14 — client-side WASM prover, payroll UI, auditor key UI |
| `backend/` | Express + TypeScript — Stellar event indexer, REST API |
| `mobile/` | Expo React Native — ZK credential wallet |

## Quick Start

### Prerequisites
- [Nargo](https://noir-lang.org/docs/getting_started/installation/) ≥ 0.36
- [Rust](https://rustup.rs/) + `wasm32-unknown-unknown` target
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli)
- Node.js ≥ 20, Yarn

### 1. ZK Circuits
```bash
cd circuits
nargo build          # compile circuit
nargo prove          # generate test proof
nargo verify         # verify test proof
```

### 2. Smart Contract
```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/zeneith_contracts.wasm \
  --network testnet
```

### 3. Backend
```bash
cp .env.example .env   # fill in CONTRACT_ID
cd backend && yarn install && yarn dev
```

### 4. Frontend
```bash
cd frontend && yarn install && yarn dev
# open http://localhost:3000
```

### 5. Mobile
```bash
cd mobile && yarn install && yarn start
```

## Key Flows

**Shielded Payroll**
1. Employer enters salaries in browser → WASM prover generates proof locally
2. Only `(proof, commitment, total)` sent to Soroban contract
3. Contract verifies BN254 proof on-chain, stores `PayrollRecord`
4. Backend indexes the event; dashboard shows aggregate totals

**Auditor Viewing Key**
1. Employer calls `register_viewing_key` with an encrypted key
2. Auditor fetches key via `/viewing-key/:employer`
3. Auditor decrypts off-chain to view individual line items

**ZK Tax Compliance**
1. Employer generates compliance proof (tax_paid ≥ gross × rate)
2. Proof submitted via `submit_tax_proof` — gross amount never revealed

## Environment Variables

See `.env.example` for all required variables.

## License

MIT
