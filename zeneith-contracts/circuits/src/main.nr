// Zeneith Payroll Circuit
// Curve: BLS12-381 (matches Soroban CAP-0080 host functions)
// Proves: sum(salaries) == total_amount, without revealing individual salaries.
// Private inputs stay in the browser; total_amount and salary_commitment are public.

use std::hash::pedersen_commitment;

global MAX_EMPLOYEES: u32 = 50;

fn main(
    // Private witness
    salaries: [u64; 50],
    blinding_factors: [Field; 50],
    active_count: u32,
    // Public outputs
    total_amount: pub u64,
    salary_commitment: pub Field,
) {
    // 1. Verify active_count is within bounds
    assert(active_count as u32 <= MAX_EMPLOYEES, "active_count exceeds MAX_EMPLOYEES");

    // 2. Verify sum
    let mut computed_sum: u64 = 0;
    for i in 0..MAX_EMPLOYEES {
        computed_sum += salaries[i];
    }
    assert(computed_sum == total_amount, "Sum of salaries must equal total_amount");

    // 3. Compute and verify Pedersen commitment H(salaries || blinding_factors)
    let mut preimage: [Field; 100] = [0; 100];
    for i in 0..MAX_EMPLOYEES {
        preimage[i] = salaries[i] as Field;
        preimage[MAX_EMPLOYEES + i] = blinding_factors[i];
    }
    let computed_commitment = pedersen_commitment(preimage).x;
    assert(computed_commitment == salary_commitment, "Commitment mismatch");
}
