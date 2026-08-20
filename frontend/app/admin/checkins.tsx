import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Entry = {
  name: string;
  email?: string;
  label: string;
  kind: "booking" | "walkin";
  pass_used: boolean;
  by: string;
  child_name?: string | null;
  time: string;
};
type Report = {
  date: string;
  totals: { checkins: number; passes_used: number; members: number };
  entries: Entry[];
};

export default function AdminCheckinsToday() {
  const router = useRouter();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.checkinsToday();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Today's Check-Ins"
        backTestID="checkins-back"
        fallback="/admin"
        right={
          <Pressable testID="checkins-scan" onPress={() => router.push("/admin/scan")} hitSlop={12}>
            <Ionicons name="qr-code-outline" size={24} color={colors.brand} />
          </Pressable>
        }
      />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>Could not load check-ins.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <Text style={styles.dateLine}>{data.date}</Text>

          <View style={styles.statsGrid}>
            {[
              { label: "CHECK-INS", value: data.totals.checkins, icon: "checkmark-done" },
              { label: "PASSES USED", value: data.totals.passes_used, icon: "ticket" },
              { label: "MEMBERS", value: data.totals.members, icon: "people" },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Ionicons name={s.icon as any} size={18} color={colors.brand} />
                <Text style={styles.statNum}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>WHO CHECKED IN TODAY</Text>
            {data.entries.length === 0 ? (
              <Text style={styles.muted}>No check-ins yet today.</Text>
            ) : (
              data.entries.map((e, i) => (
                <View key={i} style={styles.row} testID={`checkin-row-${i}`}>
                  <View style={[styles.dot, { backgroundColor: e.kind === "walkin" ? colors.brand : "#16A34A" }]}>
                    <Ionicons name={e.kind === "walkin" ? "walk" : "checkmark"} size={13} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.label} numberOfLines={1}>
                      {e.label}{e.child_name ? ` · ${e.child_name}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 3 }}>
                    <Text style={styles.time}>{e.time}{e.by ? ` · ${e.by}` : ""}</Text>
                    {e.pass_used ? (
                      <View style={styles.passPill}>
                        <Ionicons name="ticket" size={11} color={colors.brand} />
                        <Text style={styles.passPillText}>1 pass</Text>
                      </View>
                    ) : (
                      <Text style={styles.noPass}>no pass</Text>
                    )}
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
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 40 },
  dateLine: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  statsGrid: { flexDirection: "row", gap: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border, gap: 2 },
  statNum: { color: colors.brand, fontSize: 26, fontFamily: font.display },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 9.5, letterSpacing: 0.8, fontWeight: "800" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTitle: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, fontWeight: "900", marginBottom: spacing.sm },
  muted: { color: colors.onSurfaceSecondary, fontSize: 13, paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  label: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginTop: 1 },
  time: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  passPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  passPillText: { color: colors.brand, fontWeight: "900", fontSize: 10 },
  noPass: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
});
