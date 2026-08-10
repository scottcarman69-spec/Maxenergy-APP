import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  scheduled_time?: string;
  attended?: boolean;
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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
      <View style={styles.header}>
        <Pressable testID="booking-history-back" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Booking Log</Text>
          <Text style={styles.headerSub}>Your full saved history — including cleared bookings</Text>
        </View>
      </View>

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
                      {b.attended ? " · Attended" : ""}
                    </Text>
                    <View style={styles.metaRow}>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                      <Text style={styles.when}>{fmtWhen(b.created_at)}</Text>
                    </View>
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
});
