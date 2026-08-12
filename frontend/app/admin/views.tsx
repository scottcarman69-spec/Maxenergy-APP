import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classDate, classTime } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";

type EventView = { event_id: string; title: string; start_at?: string; unique_users: number; total_views: number };
type AnnView = { announcement_id: string; title: string; pinned?: boolean; created_at?: string; unique_users: number; total_views: number };
type ViewsData = { notices: { unique_users: number; total_views: number }; events: EventView[]; announcements: AnnView[] };

export default function AdminViews() {
  const [data, setData] = useState<ViewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminViews();
      setData(r);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const events = data?.events || [];
  const announcements = data?.announcements || [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Content Views" backTestID="views-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <Text style={styles.hint}>How many members have viewed your content. Staff/admin views are not counted.</Text>

          {/* Notices card */}
          <Text style={styles.section}>GYM NOTICES</Text>
          <View style={styles.card}>
            <View style={styles.cardIcon}>
              <Ionicons name="megaphone" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Notices page</Text>
              <Text style={styles.cardSub}>Members who opened the Notices tab</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{data?.notices.unique_users ?? 0}</Text>
              <Text style={styles.statLabel}>members</Text>
            </View>
          </View>
          <Text style={styles.metaLine}>{data?.notices.total_views ?? 0} total opens</Text>

          {/* Per-notice breakdown */}
          <Text style={[styles.section, { marginTop: spacing.xl }]}>VIEWS PER NOTICE</Text>
          {announcements.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="eye-off-outline" size={34} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No notice reads recorded yet.</Text>
            </View>
          ) : (
            announcements.map((a) => (
              <View key={a.announcement_id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name={a.pinned ? "pin" : "megaphone"} size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{a.title}</Text>
                  {!!a.created_at && (
                    <Text style={styles.cardSub}>
                      Posted {classDate(a.created_at, { day: "2-digit", month: "short" })}
                    </Text>
                  )}
                  <Text style={styles.cardSub}>{a.total_views} total views</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{a.unique_users}</Text>
                  <Text style={styles.statLabel}>members</Text>
                </View>
              </View>
            ))
          )}

          {/* Events */}
          <Text style={[styles.section, { marginTop: spacing.xl }]}>UPCOMING EVENTS</Text>
          {events.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="eye-off-outline" size={34} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No event views recorded yet.</Text>
            </View>
          ) : (
            events.map((e) => (
              <View key={e.event_id} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Ionicons name="calendar" size={22} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{e.title}</Text>
                  {!!e.start_at && (
                    <Text style={styles.cardSub}>
                      {classDate(e.start_at, { weekday: "short", day: "2-digit", month: "short" })} · {classTime(e.start_at)}
                    </Text>
                  )}
                  <Text style={styles.cardSub}>{e.total_views} total views</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{e.unique_users}</Text>
                  <Text style={styles.statLabel}>members</Text>
                </View>
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
  hint: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
  section: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5, marginBottom: spacing.md },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 15.5, fontFamily: font.heading },
  cardSub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  statBox: { alignItems: "center", minWidth: 56 },
  statNum: { color: colors.brand, fontSize: 24, fontFamily: font.display },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 0.5 },
  metaLine: { color: colors.onSurfaceSecondary, fontSize: 12, marginLeft: 4 },
  empty: { alignItems: "center", padding: 40, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary },
});
