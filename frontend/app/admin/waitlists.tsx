import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Member = { position: number; name: string; email?: string; joined?: string | null };
type ClassWL = { class_id: string; class_name: string; when?: string; members: Member[] };
type Report = { classes: ClassWL[]; totals: { classes: number; waiting: number } };

export default function AdminWaitlists() {
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminWaitlists();
      setData(r);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Waitlists" backTestID="waitlists-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          <View style={styles.statsGrid}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data?.totals.waiting ?? 0}</Text>
              <Text style={styles.statLabel}>WAITING</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{data?.totals.classes ?? 0}</Text>
              <Text style={styles.statLabel}>CLASSES</Text>
            </View>
          </View>

          {(!data || data.classes.length === 0) ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No one is on a waitlist right now.</Text>
              <Text style={styles.emptySub}>When a class fills up, members who join the waitlist will appear here.</Text>
            </View>
          ) : (
            data.classes.map((c) => (
              <View key={c.class_id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className} numberOfLines={1}>{c.class_name}</Text>
                    {!!c.when && <Text style={styles.when}>{c.when}</Text>}
                  </View>
                  <View style={styles.countPill}>
                    <Ionicons name="people" size={13} color={colors.brand} />
                    <Text style={styles.countPillText}>{c.members.length}</Text>
                  </View>
                </View>
                {c.members.map((m) => (
                  <View key={(m.email || "") + m.position} style={styles.row}>
                    <View style={styles.posChip}><Text style={styles.posText}>{m.position}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
                      <Text style={styles.sub} numberOfLines={1}>{m.email}{m.joined ? ` · joined ${m.joined}` : ""}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
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
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  className: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  when: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,122,0,0.15)", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  countPillText: { color: colors.brand, fontWeight: "900", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  posChip: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  posText: { color: colors.onSurface, fontWeight: "900", fontSize: 13 },
  name: { color: colors.onSurface, fontSize: 14.5, fontWeight: "700" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginTop: 1 },
  empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  emptyText: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 6 },
  emptySub: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
