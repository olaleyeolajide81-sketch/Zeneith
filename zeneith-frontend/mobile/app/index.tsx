import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { listProofs, deleteProof, isValid, type IdentityProof } from "../src/wallet/credentialWallet";

export default function HomeScreen() {
  const [proofs, setProofs] = useState<IdentityProof[]>([]);

  useEffect(() => { listProofs().then(setProofs); }, []);

  async function handleDelete(id: string) {
    await deleteProof(id);
    setProofs((p) => p.filter((x) => x.id !== id));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Zeneith Identity Wallet</Text>
      <Text style={styles.sub}>Your ZK employment proofs — no salary or address revealed.</Text>

      {proofs.length === 0 && (
        <Text style={styles.empty}>No proofs stored yet. Request one from your employer.</Text>
      )}

      <FlatList
        data={proofs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.card, !isValid(item) && styles.expired]}>
            <Text style={styles.cardTitle}>Employment Proof</Text>
            <Text style={styles.cardSub}>Employer: {item.employerCommitment.slice(0, 16)}…</Text>
            <Text style={styles.cardSub}>
              {isValid(item)
                ? `Valid until ${new Date(item.expiresAt).toLocaleDateString()}`
                : "Expired"}
            </Text>
            <TouchableOpacity onPress={() => handleDelete(item.id)}>
              <Text style={styles.delete}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: "#0f0f1a" },
  title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  sub: { color: "#aaa", marginBottom: 24 },
  empty: { color: "#666", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 12 },
  expired: { opacity: 0.5 },
  cardTitle: { color: "#fff", fontWeight: "600", marginBottom: 4 },
  cardSub: { color: "#aaa", fontSize: 13 },
  delete: { color: "#e74c3c", marginTop: 8, fontSize: 13 },
});
