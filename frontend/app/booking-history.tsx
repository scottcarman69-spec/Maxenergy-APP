import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { stampTime, stampDate, classStartMs, qldNowUTC } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";
import ScreenHeader from "@/src/components/ScreenHeader";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  requested_at?: string;
  scheduled_time?: string;
  class_start?: string;
  duration_min?: number;
  attended?: boolean;
  checked_in_method?: string;
  checked_in_by?: string;
  checked_in_at?: string;
  cleared?: boolean;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE REQUESTED", bg: colors.surfaceTertiary, fg: colors.onSurface },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

function fmtWhen(iso?: string) {
  if (!iso) return "";
  return stampDate(iso, { day: "2-digit", month: "short", year: "numeric" }) + " · " + stampTime(iso);
}

export default function BookingHistory() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.bookingsHistory();
      setBookings(r.bookings || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <ScreenHeader title="Booking Log" subtitle="Your full saved history" backTestID="booking-history-back" fallback="/(tabs)/profile" />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {bookings.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No bookings yet. Every class you book is saved here permanently.</Text>
            </View>
          ) : (
            bookings.map((b) => {
              const meta = STATUS_META[b.status] || { label: b.status.toUpperCase(), bg: colors.surfaceTertiary, fg: colors.onSurface };
              const startIso = b.by_appointment ? b.requested_at : b.class_start;
              const endMs = startIso ? classStartMs(startIso) + ((b.duration_min || 60) * 60000) : NaN;
              const missed = !b.attended && (b.status === "paid" || b.status === "confirmed")
                && !Number.isNaN(endMs) && qldNowUTC().getTime() > endMs;
              return (
                <View key={b.booking_id} testID={`booking-history-${b.booking_id}`} style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Ionicons name="calendar" size={18} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.title} numberOfLines={1}>{b.class_name}</Text>
                      {b.cleared && (
                        <View style={styles.clearedTag}>
                          <Text style={styles.clearedTagText}>CLEARED</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.body}>
                      {b.by_appointment ? "By appointment" : `$${(b.amount / 100).toFixed(0)}`}
                      {b.scheduled_time ? ` · ${b.scheduled_time}` : ""}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.when}>{fmtWhen(b.created_at)}</Text>
                    </View>
                    {b.attended ? (
                      <View style={styles.attendBox}>
                        <View style={styles.attendHead}>
                          <Ionicons name="checkmark-circle" size={14} color="#fff" />
                          <Text style={styles.attendHeadText}>ATTENDANCE CONFIRMED</Text>
                        </View>
                        <Text style={styles.attendDetail}>Method: {b.checked_in_method === "manual" ? "Staff (manual)" : "QR Code"}</Text>
                        {!!b.checked_in_by && <Text style={styles.attendDetail}>Confirmed by: {b.checked_in_by}</Text>}
                        {!!b.checked_in_at && <Text style={styles.attendDetail}>Confirmed: {stampDate(b.checked_in_at, { weekday: "short", day: "numeric", month: "short" })} · {stampTime(b.checked_in_at)}</Text>}
                      </View>
                    ) : missed ? (
                      <View style={styles.missedBox}>
                        <Ionicons name="alert-circle" size={13} color={colors.error} />
                        <Text style={styles.missedText}>QR code was not confirmed during class time</Text>
                      </View>
                    ) : null}
                  </View>
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
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: colors.onSurface, fontWeight: "800", fontSize: 15, flex: 1 },
  clearedTag: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  clearedTagText: { color: colors.onSurfaceSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 8, flexWrap: "wrap" },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  when: { color: colors.onSurfaceSecondary, fontSize: 11, opacity: 0.8 },
  attendBox: { marginTop: 8, backgroundColor: "rgba(16,185,129,0.10)", borderWidth: 1, borderColor: colors.success, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  attendHead: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 },
  attendHeadText: { color: colors.success, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.5 },
  attendDetail: { color: colors.onSurface, fontSize: 11.5, fontWeight: "600" },
  missedBox: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "rgba(239,68,68,0.10)", borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, padding: spacing.sm },
  missedText: { color: colors.error, fontSize: 11.5, fontWeight: "800", flex: 1 },
});
