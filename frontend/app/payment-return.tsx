import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "@/src/theme";

export default function PaymentReturn() {
  const params = useLocalSearchParams<{ status?: string; booking_id?: string; store?: string }>();
  const router = useRouter();
  const success = params.status === "success";

  useEffect(() => {
    const t = setTimeout(() => {
      if (success && params.store) {
        router.replace("/store-receipt");
      } else if (success && params.booking_id) {
        router.replace({ pathname: "/receipt", params: { booking_id: String(params.booking_id) } });
      } else {
        router.replace("/(tabs)/profile");
      }
    }, 1400);
    return () => clearTimeout(t);
  }, [router, success, params.booking_id, params.store]);

  return (
    <View style={styles.root}>
      <Ionicons
        name={success ? "checkmark-circle" : "close-circle"}
        size={72}
        color={success ? colors.brand : colors.error}
      />
      <Text style={styles.title}>{success ? "Payment successful" : "Payment cancelled"}</Text>
      <Text style={styles.sub}>{success ? "Preparing your receipt…" : "Redirecting…"}</Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginTop: 12 },
  sub: { color: colors.onSurfaceSecondary },
});
