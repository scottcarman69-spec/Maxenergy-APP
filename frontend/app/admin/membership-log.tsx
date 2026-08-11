import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Platform, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { stampTime, stampDate } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";

type LogItem = {
  application_id: string;
  full_name: string;
  email: string;
  plan_name: string;
  category: string;
  status: "approved" | "declined";
  decided_at?: string;
  decided_by?: string;
  created_at: string;
  has_pdf?: boolean;
};

function fmtWhen(iso?: string) {
  if (!iso) return "—";
  return stampDate(iso, { day: "2-digit", month: "short", year: "numeric" }) + " · " + stampTime(iso);
}

export default function MembershipLog() {
  const router = useRouter();
  const [items, setItems] = useState<LogItem[]>([]);
  const [approved, setApproved] = useState(0);
  const [declined, setDeclined] = useState(0);
  const [filter, setFilter] = useState<"all" | "approved" | "declined">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminMembershipLog();
      setItems(r.log || []);
      setApproved(r.approved || 0);
      setDeclined(r.declined || 0);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openPdf = async (id: string) => {
    try {
      const { url } = await api.membershipFormUrl(id);
      if (Platform.OS === "web") Linking.openURL(url).catch(() => {});
      else WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
    } catch {}
  };

  const shown = items.filter((i) => filter === "all" || i.status === filter);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        <Pressable testID="mlog-back" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Membership Decisions</Text>
          <Text style={styles.headerSub}>Log of approved & declined applications</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.stat, { borderColor: colors.brand }]}>
          <Text style={[styles.statNum, { color: colors.brand }]}>{approved}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={[styles.stat, { borderColor: colors.error }]}>
          <Text style={[styles.statNum, { color: colors.error }]}>{declined}</Text>
          <Text style={styles.statLabel}>Declined</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(["all", "approved", "declined"] as const).map((f) => (
          <Pressable key={f} testID={`mlog-filter-${f}`} style={[styles.chip, filter === f && styles.chipOn]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f[0].toUpperCase() + f.slice(1)}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {shown.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No decisions yet. Approved and declined applications will appear here.</Text>
            </View>
          ) : (
            shown.map((i) => {
              const isApproved = i.status === "approved";
              return (
                <View key={i.application_id} testID={`mlog-${i.application_id}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>{i.full_name}</Text>
                    <View style={[styles.badge, { backgroundColor: isApproved ? colors.brand : colors.error }]}>
                      <Ionicons name={isApproved ? "checkmark-circle" : "close-circle"} size={12} color="#fff" />
                      <Text style={styles.badgeText}>{i.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>{i.plan_name} · {i.category}</Text>
                  <Text style={styles.meta}>{i.email}</Text>
                  <View style={styles.decidedRow}>
                    <Ionicons name="time-outline" size={13} color={colors.onSurfaceSecondary} />
                    <Text style={styles.decided}>{fmtWhen(i.decided_at)}{i.decided_by ? `  ·  by ${i.decided_by}` : ""}</Text>
                  </View>
                  {!!i.has_pdf && (
                    <Pressable testID={`mlog-pdf-${i.application_id}`} style={styles.pdfBtn} onPress={() => openPdf(i.application_id)}>
                      <Ionicons name="document-text" size={15} color={colors.brand} />
                      <Text style={styles.pdfText}>View membership PDF</Text>
                    </Pressable>
                  )}
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
  root: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stat: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surfaceSecondary },
  statNum: { fontSize: 26, fontFamily: font.display },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "800" },
  chipTextOn: { color: colors.onBrand },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13 },
  decidedRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  decided: { color: colors.onSurfaceSecondary, fontSize: 12 },
  pdfBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brandTertiary },
  pdfText: { color: colors.brand, fontWeight: "800", fontSize: 12.5 },
});
