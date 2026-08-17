import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Member = { name: string; email?: string; remaining: number; used: number; last_used?: string | null; last_reason?: string | null };
type Report = { members: Member[]; totals: { members: number; passes_outstanding: number; passes_used: number } };

export default function AdminPasses() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.passesReport();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Class Pass Report" backTestID="passes-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
          <View style={styles.statsGrid}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data?.totals.passes_outstanding ?? 0}</Text>
              <Text style={styles.statLabel}>PASSES LEFT</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data?.totals.passes_used ?? 0}</Text>
              <Text style={styles.statLabel}>PASSES USED</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data?.totals.members ?? 0}</Text>
              <Text style={styles.statLabel}>MEMBERS</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>MEMBERS</Text>
            {(!data || data.members.length === 0) ? (
              <Text style={styles.muted}>No members hold or have used class passes yet.</Text>
            ) : (
              data.members.map((m, i) => (
                <View key={(m.email || "") + i} style={styles.row}>
                  <View style={styles.avatar}>
                    <Ionicons name="ticket" size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {m.email}{m.last_used ? ` · last used ${m.last_used}` : ""}
                    </Text>
                  </View>
                  <View style={styles.pills}>
                    <View style={[styles.pill, { backgroundColor: m.remaining > 0 ? "rgba(34,197,94,0.15)" : colors.surfaceTertiary }]}>
                      <Text style={[styles.pillNum, { color: m.remaining > 0 ? "#22C55E" : colors.onSurfaceSecondary }]}>{m.remaining}</Text>
                      <Text style={styles.pillLabel}>left</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: colors.surfaceTertiary }]}>
                      <Text style={[styles.pillNum, { color: colors.onSurface }]}>{m.used}</Text>
                      <Text style={styles.pillLabel}>used</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  statsGrid: { flexDirection: "row", gap: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg, alignItems: "center" },
  statNum: { color: colors.brand, fontSize: 26, fontFamily: font.heading },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 9.5, letterSpacing: 0.8, fontWeight: "800", marginTop: 2 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTitle: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "900", marginBottom: spacing.md },
  muted: { color: colors.onSurfaceSecondary, fontSize: 13.5 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontSize: 14.5, fontWeight: "800" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginTop: 1 },
  pills: { flexDirection: "row", gap: 6 },
  pill: { alignItems: "center", borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 5, minWidth: 42 },
  pillNum: { fontSize: 16, fontWeight: "900" },
  pillLabel: { color: colors.onSurfaceSecondary, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
});
