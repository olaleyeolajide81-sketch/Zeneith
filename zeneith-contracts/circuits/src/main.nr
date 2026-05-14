// Zeneith Payroll Circuit
// Proves: sum(salaries) == total_amount, without revealing individual salaries.
// Inputs are private (witness); commitment and total are public.

use std::hash::pedersen_commitment;

// MAX_EMPLOYEES = 50; use fixed-size array for circuit compatibility
global MAX_EMPLOYEES: u32 = 50;

fn main(
    // Private witness: individual salary amounts
    salaries: [u64; 50],
    // Private witness: blinding factors for commitments
    blinding_factors: [Field; 50],
    // Private: number of active employees (rest are 0-padded)
    active_count: u32,
    // Public: expected total payout
    pub total_amount: u64,
    // Public: Pedersen commitment to the salary vector
    pub salary_commitment: Field,
) {
    // 1. Verify sum
    let mut computed_sum: u64 = 0;
    for i in 0..MAX_EMPLOYEES {
        computed_sum += salaries[i];
    }
    assert(computed_sum == total_amount, "Sum of salaries must equal total_amount");

    // 2. Verify commitment: H(salaries || blinding_factors)
    //    We commit to the concatenated inputs via Pedersen hash.
    let mut preimage: [Field; 100] = [0; 100];
    for i in 0..MAX_EMPLOYEES {
        preimage[i] = salaries[i] as Field;
        preimage[MAX_EMPLOYEES + i] = blinding_factors[i];
    }
    let computed_commitment = pedersen_commitment(preimage).x;
    assert(computed_commitment == salary_commitment, "Commitment mismatch");

    // 3. Verify active_count is within bounds
    assert(active_count <= MAX_EMPLOYEES, "active_count exceeds MAX_EMPLOYEES");
}
