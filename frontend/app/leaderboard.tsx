import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Row = { rank: number; user_id: string; name: string; picture?: string | null; count: number; is_me: boolean; streak?: number; movement?: number | null };
type Me = { rank: number | null; count: number; opted_out: boolean; streak?: number };
type Period = "month" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
];
const MEDAL = ["#FFD700", "#C0C0C0", "#CD7F32"]; // gold / silver / bronze

function StreakPill({ streak }: { streak?: number }) {
  if (!streak || streak < 2) return null;
  return (
    <View style={styles.streakPill}>
      <Text style={styles.streakText}>🔥 {streak}w</Text>
    </View>
  );
}

function Movement({ movement }: { movement?: number | null }) {
  if (movement === undefined) return <View style={{ width: 34 }} />;
  if (movement === null) return <Text style={[styles.moveText, { color: "#22C55E" }]}>NEW</Text>;
  if (movement > 0) return <Text style={[styles.moveText, { color: "#22C55E" }]}>▲{movement}</Text>;
  if (movement < 0) return <Text style={[styles.moveText, { color: colors.error }]}>▼{-movement}</Text>;
  return <Text style={[styles.moveText, { color: colors.onSurfaceSecondary }]}>–</Text>;
}

function Avatar({ name, picture, size = 40 }: { name: string; picture?: string | null; size?: number }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (picture) {
    return <Image source={{ uri: picture }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSecondary }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.brand, fontWeight: "900", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export default function LeaderboardScreen() {
  const [period, setPeriod] = useState<Period>("month");
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Me>({ rank: null, count: 0, opted_out: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (p: Period) => {
    try {
      const r = await api.leaderboard(p);
      setRows(r.leaderboard || []);
      setMe(r.me || { rank: null, count: 0, opted_out: false });
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(period); }, [load, period]));

  const onRefresh = async () => { setRefreshing(true); await load(period); setRefreshing(false); };
  const selectPeriod = (p: Period) => { setPeriod(p); setLoading(true); load(p); };

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Attendance Ladder" backTestID="lb-back" fallback="/(tabs)/home" />

      <View style={styles.tabs}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.key}
            testID={`lb-period-${p.key}`}
            style={[styles.tab, period === p.key && styles.tabActive]}
            onPress={() => selectPeriod(p.key)}
          >
            <Text style={[styles.tabText, period === p.key && styles.tabTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 50 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="trophy-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No confirmed attendance yet for this period. Get your QR scanned at class to climb the ladder!</Text>
            </View>
          ) : (
            <>
              {/* Podium — top 3 */}
              <View style={styles.podium}>
                {[1, 0, 2].map((idx) => {
                  const r = top3[idx];
                  if (!r) return <View key={idx} style={{ flex: 1 }} />;
                  const isFirst = idx === 0;
                  return (
                    <View key={r.user_id} style={[styles.podCol, isFirst && { marginBottom: 12 }]}>
                      <View style={[styles.podAvatarWrap, { borderColor: MEDAL[idx] }]}>
                        <Avatar name={r.name} picture={r.picture} size={isFirst ? 64 : 52} />
                        <View style={[styles.medal, { backgroundColor: MEDAL[idx] }]}>
                          <Text style={styles.medalText}>{r.rank}</Text>
                        </View>
                      </View>
                      <Text style={[styles.podName, r.is_me && { color: colors.brand }]} numberOfLines={1}>{r.name}{r.is_me ? " (You)" : ""}</Text>
                      <Text style={styles.podCount}>{r.count}</Text>
                      <Text style={styles.podCountLabel}>classes</Text>
                      <View style={styles.podExtras}>
                        <Movement movement={r.movement} />
                        {(r.streak || 0) >= 2 && <StreakPill streak={r.streak} />}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Ranks 4–30 */}
              {rest.map((r) => (
                <View key={r.user_id} testID={`lb-row-${r.rank}`} style={[styles.row, r.is_me && styles.rowMe]}>
                  <Text style={[styles.rank, r.is_me && { color: colors.brand }]}>{r.rank}</Text>
                  <Avatar name={r.name} picture={r.picture} size={38} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.name, r.is_me && { color: colors.brand, fontWeight: "900" }]} numberOfLines={1}>
                      {r.name}{r.is_me ? " (You)" : ""}
                    </Text>
                    {(r.streak || 0) >= 2 && <StreakPill streak={r.streak} />}
                  </View>
                  <Movement movement={r.movement} />
                  <Text style={styles.count}>{r.count}</Text>
                </View>
              ))}
            </>
          )}
          <View style={{ height: 90 }} />
        </ScrollView>
      )}

      {/* Your position — always visible */}
      {!loading && (
        <View style={styles.meBar}>
          {me.opted_out ? (
            <View style={{ flex: 1 }}>
              <Text style={styles.meLabel}>YOU'RE HIDDEN FROM THE PUBLIC LADDER</Text>
              <Text style={styles.meSub}>{me.count} class{me.count === 1 ? "" : "es"} attended · turn visibility on in Inbox Settings to appear.</Text>
            </View>
          ) : (
            <>
              <View style={styles.meRankBadge}>
                <Text style={styles.meRankText}>{me.rank ? `#${me.rank}` : "—"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.meLabel}>YOUR RANK</Text>
                <Text style={styles.meSub}>{me.count} class{me.count === 1 ? "" : "es"} attended{me.rank ? "" : " · attend a class to get ranked"}</Text>
              </View>
              {(me.streak || 0) >= 2 && (
                <View style={styles.meStreak}>
                  <Text style={styles.meStreakText}>🔥 {me.streak}</Text>
                  <Text style={styles.meStreakLabel}>week streak</Text>
                </View>
              )}
              <Ionicons name="trophy" size={22} color={colors.brand} />
            </>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 12.5 },
  tabTextActive: { color: colors.onBrand },
  content: { padding: spacing.lg, paddingTop: spacing.sm },
  empty: { alignItems: "center", gap: spacing.md, paddingVertical: 50, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.xl, marginTop: spacing.sm },
  podCol: { flex: 1, alignItems: "center", gap: 2 },
  podAvatarWrap: { borderWidth: 3, borderRadius: 40, padding: 3, position: "relative" },
  medal: { position: "absolute", bottom: -6, alignSelf: "center", left: 0, right: 0, marginHorizontal: "auto", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
  medalText: { color: "#000", fontWeight: "900", fontSize: 12 },
  podName: { color: colors.onSurface, fontWeight: "800", fontSize: 12.5, marginTop: 10, maxWidth: 100, textAlign: "center" },
  podCount: { color: colors.brand, fontWeight: "900", fontSize: 20 },
  podCountLabel: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowMe: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  rank: { color: colors.onSurfaceSecondary, fontWeight: "900", fontSize: 15, width: 26, textAlign: "center" },
  name: { flex: 1, color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  count: { color: colors.onSurface, fontWeight: "900", fontSize: 16 },
  streakPill: { alignSelf: "flex-start", backgroundColor: "rgba(249,115,22,0.15)", borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  streakText: { color: "#F97316", fontSize: 10.5, fontWeight: "900" },
  moveText: { width: 34, textAlign: "center", fontSize: 12, fontWeight: "900" },
  podExtras: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5, minHeight: 18 },
  meBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.brand, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  meRankBadge: { minWidth: 52, height: 40, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  meRankText: { color: colors.onBrand, fontWeight: "900", fontSize: 18 },
  meLabel: { color: colors.onSurfaceSecondary, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6 },
  meSub: { color: colors.onSurface, fontSize: 13, fontWeight: "700", marginTop: 2 },
  meStreak: { alignItems: "center", backgroundColor: "rgba(249,115,22,0.15)", borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 4 },
  meStreakText: { color: "#F97316", fontSize: 16, fontWeight: "900" },
  meStreakLabel: { color: "#F97316", fontSize: 8.5, fontWeight: "800", textTransform: "uppercase" },
});
