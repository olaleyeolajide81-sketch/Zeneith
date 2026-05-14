// Zeneith Tax Compliance Circuit
// Proves: tax_paid >= required_tax (gross * tax_rate), without revealing gross.

fn main(
    // Private
    gross_amount: u64,
    blinding: Field,
    // Public
    pub tax_paid: u64,
    pub tax_rate_bps: u64,   // basis points, e.g. 2000 = 20%
    pub gross_commitment: Field,
) {
    // Verify commitment to gross
    let computed = std::hash::pedersen_commitment([gross_amount as Field, blinding]).x;
    assert(computed == gross_commitment, "Gross commitment mismatch");

    // Verify tax_paid >= gross * tax_rate_bps / 10000
    let required_tax = (gross_amount * tax_rate_bps) / 10000;
    assert(tax_paid >= required_tax, "Insufficient tax paid");
}
