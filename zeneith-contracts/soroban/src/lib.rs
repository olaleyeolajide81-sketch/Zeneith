//! Zeneith Payroll Verifier — Soroban Smart Contract
//!
//! Verifies a Noir-generated Groth16 proof on-chain using CAP-0080
//! BLS12-381 host functions (pairing_check), then records the shielded
//! payroll commitment.
//!
//! Curve alignment: BLS12-381 throughout.
//!   - Circuit backend: Noir + bb (Barretenberg) with BLS12-381 target
//!   - On-chain verifier: soroban_sdk::crypto::bls12_381 pairing_check

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    crypto::bls12_381::{Bls12381Fr, Bls12381G1Affine, Bls12381G2Affine},
    symbol_short,
    Address, Bytes, BytesN, Env, Vec,
};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Admin,
    VerifyingKey,
    Commitment(BytesN<32>),
    ViewingKey(Address),
    TaxRecord(BytesN<32>),
}

// ── Data types ────────────────────────────────────────────────────────────────

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

/// Groth16 verifying key (BLS12-381).
/// Points are stored as raw bytes: G1 = 96 bytes, G2 = 192 bytes.
///
/// Layout matches the output of `bb write_vk` for a BLS12-381 circuit:
///   alpha_g1  (96 bytes)
///   beta_g2   (192 bytes)
///   gamma_g2  (192 bytes)
///   delta_g2  (192 bytes)
///   ic[0]     (96 bytes)  — one per public input + 1
///   ic[1]     (96 bytes)
///   ic[2]     (96 bytes)
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha_g1: BytesN<96>,
    pub beta_g2: BytesN<192>,
    pub gamma_g2: BytesN<192>,
    pub delta_g2: BytesN<192>,
    /// IC[0..n+1] — one element per public input plus the constant term.
    /// Stored as a flat Vec of 96-byte G1 points.
    pub ic: Vec<BytesN<96>>,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ZeneithPayroll;

#[contractimpl]
impl ZeneithPayroll {
    /// Initialize contract with an admin address and the compiled verifying key.
    pub fn initialize(env: Env, admin: Address, vk: VerifyingKey) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::VerifyingKey, &vk);
    }

    /// Submit a shielded payroll batch.
    ///
    /// `proof`             — Groth16 proof: [pi_a (96B) | pi_b (192B) | pi_c (96B)] = 384 bytes
    /// `public_inputs`     — [total_amount_lo, total_amount_hi, salary_commitment_x]
    ///                       each as a 32-byte BLS12-381 Fr scalar (big-endian)
    /// `salary_commitment` — 32-byte commitment (= public_inputs[2] truncated)
    /// `total_amount`      — public total payout
    /// `employee_count`    — number of active employees
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

        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::VerifyingKey)
            .expect("not initialized");

        Self::verify_groth16_proof(&env, &vk, &proof, &public_inputs);

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

        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&DataKey::VerifyingKey)
            .expect("not initialized");

        Self::verify_groth16_proof(&env, &vk, &proof, &public_inputs);

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

    /// Retrieve encrypted viewing key — only callable by the employer themselves.
    pub fn get_viewing_key(env: Env, employer: Address) -> Option<Bytes> {
        employer.require_auth();
        env.storage()
            .persistent()
            .get(&DataKey::ViewingKey(employer))
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// Groth16 verification over BLS12-381 using CAP-0080 pairing_check.
    ///
    /// Groth16 check: e(pi_a, pi_b) == e(alpha, beta) * e(vk_x, gamma) * e(pi_c, delta)
    ///
    /// Equivalently (using the negation trick for a single pairing_check call):
    ///   pairing_check(
    ///     [-pi_a, alpha,  vk_x,  pi_c],
    ///     [ pi_b,  beta, gamma, delta],
    ///   ) == true
    ///
    /// where vk_x = IC[0] + sum_i(public_inputs[i] * IC[i+1])
    ///
    /// Proof encoding (384 bytes total):
    ///   bytes   0.. 96 → pi_a  (G1, 96 bytes)
    ///   bytes  96..288 → pi_b  (G2, 192 bytes)
    ///   bytes 288..384 → pi_c  (G1, 96 bytes)
    fn verify_groth16_proof(
        env: &Env,
        vk: &VerifyingKey,
        proof: &Bytes,
        public_inputs: &Vec<BytesN<32>>,
    ) {
        assert_eq!(proof.len(), 384, "proof must be 384 bytes");
        assert_eq!(
            public_inputs.len() as usize + 1,
            vk.ic.len() as usize,
            "public input count mismatch"
        );

        let bls = env.crypto().bls12_381();

        // Decode proof components — copy byte ranges into fixed-size arrays
        let pi_a = Bls12381G1Affine::from_bytes({
            let mut arr = [0u8; 96];
            for i in 0..96u32 { arr[i as usize] = proof.get(i).unwrap(); }
            BytesN::from_array(env, &arr)
        });
        let pi_b = Bls12381G2Affine::from_bytes({
            let mut arr = [0u8; 192];
            for i in 0..192u32 { arr[i as usize] = proof.get(96 + i).unwrap(); }
            BytesN::from_array(env, &arr)
        });
        let pi_c = Bls12381G1Affine::from_bytes({
            let mut arr = [0u8; 96];
            for i in 0..96u32 { arr[i as usize] = proof.get(288 + i).unwrap(); }
            BytesN::from_array(env, &arr)
        });

        // Compute vk_x = IC[0] + sum(public_inputs[i] * IC[i+1])
        let mut vk_x = Bls12381G1Affine::from_bytes(vk.ic.get(0).expect("IC[0] missing"));
        for i in 0..public_inputs.len() {
            let scalar = Bls12381Fr::from_bytes(public_inputs.get(i).expect("input missing"));
            let ic_i = Bls12381G1Affine::from_bytes(vk.ic.get(i + 1).expect("IC[i+1] missing"));
            let term = bls.g1_mul(&ic_i, &scalar);
            vk_x = bls.g1_add(&vk_x, &term);
        }

        // Negate pi_a for the pairing check (negate Y coordinate)
        let neg_pi_a = Self::g1_negate(env, pi_a);

        // pairing_check([-pi_a, alpha, vk_x, pi_c], [pi_b, beta, gamma, delta])
        let g1_points = soroban_sdk::vec![
            env,
            neg_pi_a,
            Bls12381G1Affine::from_bytes(vk.alpha_g1.clone()),
            vk_x,
            pi_c,
        ];
        let g2_points = soroban_sdk::vec![
            env,
            pi_b,
            Bls12381G2Affine::from_bytes(vk.beta_g2.clone()),
            Bls12381G2Affine::from_bytes(vk.gamma_g2.clone()),
            Bls12381G2Affine::from_bytes(vk.delta_g2.clone()),
        ];

        assert!(bls.pairing_check(g1_points, g2_points), "invalid proof");
    }

    /// Negate a G1 point by flipping its Y coordinate (mod p).
    /// BLS12-381 field prime p (48 bytes, big-endian).
    fn g1_negate(env: &Env, point: Bls12381G1Affine) -> Bls12381G1Affine {
        // BLS12-381 G1 point: 96 bytes = 48-byte X || 48-byte Y (uncompressed)
        let bytes = point.to_bytes();
        let mut arr = [0u8; 96];
        for i in 0..96 {
            arr[i] = bytes.get(i as u32).unwrap_or(0);
        }

        // p = 0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab
        let p: [u8; 48] = [
            0x1a, 0x01, 0x11, 0xea, 0x39, 0x7f, 0xe6, 0x9a,
            0x4b, 0x1b, 0xa7, 0xb6, 0x43, 0x4b, 0xac, 0xd7,
            0x64, 0x77, 0x4b, 0x84, 0xf3, 0x85, 0x12, 0xbf,
            0x67, 0x30, 0xd2, 0xa0, 0xf6, 0xb0, 0xf6, 0x24,
            0x1e, 0xab, 0xff, 0xfe, 0xb1, 0x53, 0xff, 0xff,
            0xb9, 0xfe, 0xff, 0xff, 0xff, 0xff, 0xaa, 0xab,
        ];

        // neg_y = p - y  (big-endian subtraction)
        let y = &arr[48..96];
        let mut neg_y = [0u8; 48];
        let mut borrow: u16 = 0;
        for i in (0..48).rev() {
            let diff = (p[i] as i16) - (y[i] as i16) - (borrow as i16);
            if diff < 0 {
                neg_y[i] = (diff + 256) as u8;
                borrow = 1;
            } else {
                neg_y[i] = diff as u8;
                borrow = 0;
            }
        }

        arr[48..96].copy_from_slice(&neg_y);
        Bls12381G1Affine::from_bytes(BytesN::from_array(env, &arr))
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn dummy_vk(env: &Env) -> VerifyingKey {
        // BLS12-381 G1 generator (uncompressed, 96 bytes)
        let g1_gen: [u8; 96] = [
            0x17, 0xf1, 0xd3, 0xa7, 0x31, 0x97, 0xd7, 0x94,
            0x26, 0x95, 0x63, 0x8c, 0x4f, 0xa9, 0xac, 0x0f,
            0xc3, 0x68, 0x8c, 0x4f, 0x97, 0x74, 0xb9, 0x05,
            0xa1, 0x4e, 0x3a, 0x3f, 0x17, 0x1b, 0xac, 0x58,
            0x6c, 0x55, 0xe8, 0x3f, 0xf9, 0x7a, 0x1a, 0xef,
            0xfb, 0x3a, 0xf0, 0x0a, 0xdb, 0x22, 0xc6, 0xbb,
            0x08, 0xb3, 0xf4, 0x81, 0xe3, 0xaa, 0xa0, 0xfa,
            0x8b, 0x16, 0xed, 0x37, 0xf8, 0x23, 0xab, 0x1e,
            0x18, 0x65, 0xf5, 0x9c, 0x11, 0xd6, 0x8b, 0xf2,
            0x77, 0x93, 0x82, 0x0f, 0xb4, 0x9a, 0x08, 0x5b,
            0x97, 0xab, 0x3a, 0x6c, 0x9f, 0x0d, 0x72, 0x58,
            0x1b, 0x3d, 0x55, 0x18, 0x9b, 0x0a, 0x7c, 0x1d,
        ];
        // BLS12-381 G2 generator (uncompressed, 192 bytes) — placeholder zeros
        let g2_gen = [0u8; 192];

        let mut ic = soroban_sdk::Vec::new(env);
        ic.push_back(BytesN::from_array(env, &g1_gen));
        ic.push_back(BytesN::from_array(env, &g1_gen));
        ic.push_back(BytesN::from_array(env, &g1_gen));

        VerifyingKey {
            alpha_g1: BytesN::from_array(env, &g1_gen),
            beta_g2: BytesN::from_array(env, &g2_gen),
            gamma_g2: BytesN::from_array(env, &g2_gen),
            delta_g2: BytesN::from_array(env, &g2_gen),
            ic,
        }
    }

    #[test]
    fn test_initialize() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZeneithPayroll);
        let client = ZeneithPayrollClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let vk = dummy_vk(&env);
        client.initialize(&admin, &vk);

        // Verify VK was stored
        let stored: VerifyingKey = env
            .as_contract(&contract_id, || {
                env.storage()
                    .instance()
                    .get(&DataKey::VerifyingKey)
                    .unwrap()
            });
        assert_eq!(stored.ic.len(), 3);
    }

    #[test]
    fn test_viewing_key_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ZeneithPayroll);
        let client = ZeneithPayrollClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin, &dummy_vk(&env));

        let employer = Address::generate(&env);
        let key = Bytes::from_slice(&env, b"encrypted-key-data");
        client.register_viewing_key(&employer, &key);

        // get_viewing_key requires employer auth (mocked here)
        let result = client.get_viewing_key(&employer);
        assert!(result.is_some());
    }
}
