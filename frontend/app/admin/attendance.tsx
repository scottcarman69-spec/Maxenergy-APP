import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

type Report = {
  totals: { today: number; week: number; month: number; all: number };
  daily: { date: string; iso: string; count: number }[];
  by_class: { name: string; count: number }[];
  top_members: { name: string; email?: string; count: number }[];
  recent: { name: string; email?: string; class_name: string; date: string; time: string; by: string }[];
};

export default function AdminAttendance() {
  const router = useRouter();
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.attendanceReport();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.count));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="att-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Attendance Report</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>Could not load report.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
          <View style={styles.statsGrid}>
            {[
              { label: "TODAY", value: data.totals.today },
              { label: "THIS WEEK", value: data.totals.week },
              { label: "THIS MONTH", value: data.totals.month },
              { label: "ALL TIME", value: data.totals.all },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statNum}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>LAST 14 DAYS</Text>
            <View style={styles.chart}>
              {data.daily.map((d) => (
                <View key={d.iso} style={styles.barCol}>
                  <Text style={styles.barVal}>{d.count > 0 ? d.count : ""}</Text>
                  <View style={[styles.bar, { height: Math.max(4, (d.count / maxDaily) * 120) }]} />
                  <Text style={styles.barLabel}>{d.date.split(" ")[1]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>BY CLASS</Text>
            {data.by_class.length === 0 ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.by_class.map((c) => (
                <View key={c.name} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.rowCount}>{c.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>MOST ACTIVE MEMBERS</Text>
            {data.top_members.length === 0 ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.top_members.map((m, i) => (
                <View key={(m.email || "") + i} style={styles.row}>
                  <Text style={styles.rowRank}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{m.name}</Text>
                    {!!m.email && <Text style={styles.rowEmail} numberOfLines={1}>{m.email}</Text>}
                  </View>
                  <Text style={styles.rowCount}>{m.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>RECENT CHECK-INS</Text>
            {(!data.recent || data.recent.length === 0) ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.recent.map((c, i) => (
                <View key={i} style={styles.checkinRow}>
                  <View style={styles.checkinDot}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.rowEmail} numberOfLines={1}>{c.class_name}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.ciDate}>{c.date}</Text>
                    <Text style={styles.ciTime}>{c.time}{c.by === "admin" ? " · by staff" : ""}</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 40 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 30, fontFamily: font.display },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "800", marginTop: 2 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, fontWeight: "900", marginBottom: spacing.sm },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 160, gap: 2 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  bar: { width: "70%", backgroundColor: colors.brand, borderRadius: 3 },
  barVal: { color: colors.onSurface, fontSize: 9, fontWeight: "800" },
  barLabel: { color: colors.onSurfaceSecondary, fontSize: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  rowRank: { color: colors.brand, fontWeight: "900", width: 20, fontSize: 15 },
  rowName: { color: colors.onSurface, fontWeight: "700", fontSize: 14, flex: 1 },
  rowEmail: { color: colors.onSurfaceSecondary, fontSize: 11 },
  rowCount: { color: colors.brand, fontWeight: "900", fontSize: 16 },
  muted: { color: colors.onSurfaceSecondary, fontSize: 13, paddingVertical: 6 },
  checkinRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  checkinDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  ciDate: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  ciTime: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 1 },
});
