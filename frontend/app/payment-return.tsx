import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export default function PaymentReturn() {
  const params = useLocalSearchParams<{ status?: string; session_id?: string }>();
  const router = useRouter();
  const success = params.status === "success";

  useEffect(() => {
    const t = setTimeout(() => router.replace("/(tabs)/profile"), 2200);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View style={styles.root}>
      <Ionicons
        name={success ? "checkmark-circle" : "close-circle"}
        size={72}
        color={success ? colors.brand : colors.error}
      />
      <Text style={styles.title}>{success ? "Payment successful" : "Payment cancelled"}</Text>
      <Text style={styles.sub}>Redirecting…</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginTop: 12 },
  sub: { color: colors.onSurfaceSecondary },
});
