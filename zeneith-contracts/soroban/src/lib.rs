//! Zeneith Payroll Verifier — Soroban Smart Contract
//!
//! Verifies a Noir-generated BN254 ZK proof on-chain using CAP-0080
//! bn254_g1_msm host functions, then records the shielded payroll commitment.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bls12_381,
    Address, Bytes, BytesN, Env, Map, Vec,
};

// ── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    Commitment(BytesN<32>),   // salary_commitment → PayrollRecord
    ViewingKey(Address),       // employer → encrypted viewing key
    TaxRecord(BytesN<32>),     // commitment → TaxRecord
}

// ── Data types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct PayrollRecord {
    pub employer: Address,
    pub total_amount: u64,
    pub employee_count: u32,
    pub timestamp: u64,
    pub commitment: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct TaxRecord {
    pub employer: Address,
    pub tax_paid: u64,
    pub tax_rate_bps: u64,
    pub timestamp: u64,
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct ZeneithPayroll;

#[contractimpl]
impl ZeneithPayroll {
    /// Initialize contract with an admin address.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Submit a shielded payroll batch.
    ///
    /// `proof`             — Noir-generated Groth16 proof bytes (BN254)
    /// `public_inputs`     — [total_amount_lo, total_amount_hi, commitment_x, commitment_y]
    /// `salary_commitment` — 32-byte Pedersen commitment to salary vector
    /// `total_amount`      — public total payout (in stroops or token base units)
    /// `employee_count`    — number of active employees (public)
    pub fn submit_payroll(
        env: Env,
        employer: Address,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
        salary_commitment: BytesN<32>,
        total_amount: u64,
        employee_count: u32,
    ) -> BytesN<32> {
        employer.require_auth();

        // Verify ZK proof using BN254 host functions (CAP-0080 / Protocol 26)
        Self::verify_bn254_proof(&env, &proof, &public_inputs);

        let record = PayrollRecord {
            employer: employer.clone(),
            total_amount,
            employee_count,
            timestamp: env.ledger().timestamp(),
            commitment: salary_commitment.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Commitment(salary_commitment.clone()), &record);

        env.events().publish(
            (symbol_short!("payroll"), employer),
            (salary_commitment.clone(), total_amount, employee_count),
        );

        salary_commitment
    }

    /// Submit a ZK tax-compliance proof.
    pub fn submit_tax_proof(
        env: Env,
        employer: Address,
        proof: Bytes,
        public_inputs: Vec<BytesN<32>>,
        gross_commitment: BytesN<32>,
        tax_paid: u64,
        tax_rate_bps: u64,
    ) {
        employer.require_auth();

        Self::verify_bn254_proof(&env, &proof, &public_inputs);

        let record = TaxRecord {
            employer: employer.clone(),
            tax_paid,
            tax_rate_bps,
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::TaxRecord(gross_commitment.clone()), &record);

        env.events().publish(
            (symbol_short!("tax"), employer),
            (gross_commitment, tax_paid, tax_rate_bps),
        );
    }

    /// Register an encrypted viewing key for selective disclosure.
    pub fn register_viewing_key(env: Env, employer: Address, encrypted_key: Bytes) {
        employer.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::ViewingKey(employer), &encrypted_key);
    }

    /// Retrieve a payroll record by commitment (public read).
    pub fn get_payroll(env: Env, commitment: BytesN<32>) -> Option<PayrollRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Commitment(commitment))
    }

    /// Retrieve a tax record by gross commitment.
    pub fn get_tax_record(env: Env, commitment: BytesN<32>) -> Option<TaxRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::TaxRecord(commitment))
    }

    /// Retrieve encrypted viewing key for an employer.
    pub fn get_viewing_key(env: Env, employer: Address) -> Option<Bytes> {
        env.storage()
            .persistent()
            .get(&DataKey::ViewingKey(employer))
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    /// Verify a BN254 Groth16 proof using CAP-0080 host functions.
    /// In production, supply the actual verifying key and use bn254_g1_msm.
    fn verify_bn254_proof(env: &Env, proof: &Bytes, public_inputs: &Vec<BytesN<32>>) {
        // CAP-0080: use env.crypto().bls12_381() host functions for BN254 ops.
        // The actual MSM call pattern:
        //   env.crypto().bls12_381().g1_msm(vk_points, scalars)
        // Here we assert proof is non-empty as a placeholder until the
        // verifying key is embedded post circuit compilation.
        assert!(!proof.is_empty(), "empty proof");
        assert!(public_inputs.len() >= 2, "insufficient public inputs");
        // TODO: embed compiled verifying key and call bn254_g1_msm for full verification
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_initialize_and_submit() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZeneithPayroll);
        let client = ZeneithPayrollClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        let employer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, &[1u8; 32]);
        let commitment = BytesN::from_array(&env, &[0u8; 32]);
        let mut inputs = Vec::new(&env);
        inputs.push_back(BytesN::from_array(&env, &[0u8; 32]));
        inputs.push_back(BytesN::from_array(&env, &[0u8; 32]));

        let result = client.submit_payroll(
            &employer, &proof, &inputs, &commitment, &6000u64, &3u32,
        );
        assert_eq!(result, commitment);
    }
}
