import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { stampDate, stampTime } from "@/src/datetime";

type Entry = { ledger_id: string; delta_cents: number; reason: string; created_at: string };

export default function CreditsScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myCredits();
      setBalance(r.balance_cents || 0);
      setEntries(r.entries || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="credits-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>My Credit</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <View style={styles.balanceCard}>
            <Ionicons name="wallet" size={26} color={colors.brand} />
            <Text style={styles.balanceLabel}>AVAILABLE CREDIT</Text>
            <Text style={styles.balanceAmount}>${(balance / 100).toFixed(2)}</Text>
            <Text style={styles.balanceHint}>Use it when you book a class — it's applied before your card.</Text>
          </View>

          <Text style={styles.sectionLabel}>HISTORY</Text>
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={30} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No credit activity yet. Credits from cancelled classes will show here.</Text>
            </View>
          ) : (
            entries.map((e) => {
              const earned = e.delta_cents >= 0;
              return (
                <View key={e.ledger_id} testID={`credit-${e.ledger_id}`} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: earned ? "rgba(34,197,94,0.15)" : colors.brandTertiary }]}>
                    <Ionicons name={earned ? "arrow-down" : "arrow-up"} size={16} color={earned ? "#22C55E" : colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reason} numberOfLines={2}>{e.reason}</Text>
                    <Text style={styles.date}>{stampDate(e.created_at, { day: "2-digit", month: "short", year: "numeric" })} · {stampTime(e.created_at)}</Text>
                  </View>
                  <Text style={[styles.delta, { color: earned ? "#22C55E" : colors.onSurface }]}>
                    {earned ? "+" : "−"}${Math.abs(e.delta_cents / 100).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  content: { padding: spacing.lg, paddingBottom: 40 },
  balanceCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: 4 },
  balanceLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.sm },
  balanceAmount: { color: colors.brand, fontSize: 40, fontWeight: "900" },
  balanceHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 18 },
  sectionLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: 40 },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  reason: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  date: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  delta: { fontSize: 16, fontWeight: "900" },
});
