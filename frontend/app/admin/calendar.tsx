import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, scheduleDay, qldTodayUTC } from "@/src/datetime";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  requested_time?: string;
  requested_at?: string;
  scheduled_time?: string;
  class_start?: string;
  member_name?: string;
  member_email?: string;
};

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: colors.success },
  confirmed: { label: "Confirmed", color: colors.success },
  pending: { label: "Pending", color: colors.warning },
  reschedule_requested: { label: "Reschedule", color: "#B45309" },
  cancelled: { label: "Cancelled", color: colors.info },
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// The date a booking sits on: fixed classes use class_start; appointments use
// their (preferred/confirmed) requested_at. Both are Queensland wall-clock.
function anchorIso(b: Booking): string | null {
  if (b.by_appointment) return b.requested_at || null;
  return b.class_start || null;
}
function dayKeyOf(iso: string): string {
  return scheduleDay(iso).toISOString().slice(0, 10);
}
function anchorHour(b: Booking): number {
  const iso = anchorIso(b);
  if (!iso) return 9999; // no time → sort last
  const d = scheduleDay(iso);
  const parsed = new Date(iso.match(/[zZ]|[+-]\d{2}:?\d{2}$/) ? iso : iso + "Z");
  return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
}

export default function AdminCalendar() {
  const router = useRouter();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(() => {
    const t = qldTodayUTC();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  });
  const [selected, setSelected] = useState<string>(() => qldTodayUTC().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const r = await api.adminBookings();
      setRows(r.bookings || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const grouped = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of rows) {
      const iso = anchorIso(b);
      if (!iso) continue;
      const k = dayKeyOf(iso);
      (m[k] ||= []).push(b);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => anchorHour(a) - anchorHour(b));
    return m;
  }, [rows]);

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const todayKey = qldTodayUTC().toISOString().slice(0, 10);

  const cells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 Sun
    const leading = (firstWeekday + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const keyFor = (d: number) =>
    new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);

  const monthBookings = useMemo(
    () => cells.reduce<number>((n, d) => n + (d ? (grouped[keyFor(d)]?.length || 0) : 0), 0),
    [cells, grouped, year, month]
  );

  const dayList = grouped[selected] || [];
  const selectedLabel = classDate(selected + "T00:00:00", { weekday: "long", day: "numeric", month: "long" });

  const shiftMonth = (delta: number) => {
    setCursor(new Date(Date.UTC(year, month + delta, 1)));
  };

  const dotColors = (dayBookings: Booking[]): string[] => {
    const order = [colors.success, colors.warning, "#B45309", colors.info];
    const present = new Set(dayBookings.map((b) => (STATUS[b.status] || STATUS.pending).color));
    return order.filter((c) => present.has(c)).slice(0, 3);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="admincal-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Bookings Calendar</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
          <View style={styles.monthBar}>
            <Pressable testID="admincal-prev" onPress={() => shiftMonth(-1)} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={styles.monthTitle}>
                {cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })}
              </Text>
              <Text style={styles.monthSub}>{monthBookings} booking{monthBookings === 1 ? "" : "s"}</Text>
            </View>
            <Pressable testID="admincal-next" onPress={() => shiftMonth(1)} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekLabel}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={styles.cell} />;
              const key = keyFor(d);
              const dayBookings = grouped[key] || [];
              const isToday = key === todayKey;
              const isSel = key === selected;
              return (
                <Pressable
                  key={i}
                  testID={`admincal-day-${d}`}
                  style={[styles.cell, styles.cellDay, isSel && styles.cellSel, isToday && !isSel && styles.cellToday]}
                  onPress={() => setSelected(key)}
                >
                  <Text style={[styles.cellNum, isSel && styles.cellNumSel, isToday && !isSel && { color: colors.brand }]}>{d}</Text>
                  <View style={styles.dots}>
                    {dotColors(dayBookings).map((c, di) => (
                      <View key={di} style={[styles.dot, { backgroundColor: c }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            {[["Confirmed / Paid", colors.success], ["Pending / Reschedule", colors.warning], ["Cancelled", colors.info]].map(([l, c]) => (
              <View key={l as string} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: c as string }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.agendaTitle}>{selectedLabel}</Text>
          {dayList.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={34} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No bookings on this day.</Text>
            </View>
          ) : (
            dayList.map((b) => {
              const meta = STATUS[b.status] || { label: b.status, color: colors.info };
              const iso = anchorIso(b);
              const timeLabel = iso ? classTime(iso) : (b.scheduled_time || "Time TBC");
              return (
                <Pressable
                  key={b.booking_id}
                  testID={`admincal-booking-${b.booking_id}`}
                  style={styles.item}
                  onPress={() => router.push("/admin/bookings")}
                >
                  <View style={[styles.itemBar, { backgroundColor: meta.color }]} />
                  <View style={styles.itemTime}>
                    <Text style={styles.itemTimeText}>{timeLabel}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{b.class_name}</Text>
                    <Text style={styles.itemMember} numberOfLines={1}>
                      {b.member_name || "Member"}{b.by_appointment ? " · by appointment" : ""}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: meta.color }]}>
                    <Text style={styles.pillText}>{meta.label.toUpperCase()}</Text>
                  </View>
                </Pressable>
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
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  navBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  monthTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  monthSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellDay: { alignItems: "center", justifyContent: "center" },
  cellSel: { },
  cellToday: { },
  cellNum: { color: colors.onSurface, fontSize: 15, fontWeight: "700", width: 30, height: 30, borderRadius: 15, textAlign: "center", textAlignVertical: "center", lineHeight: 30 },
  cellNumSel: { backgroundColor: colors.brand, color: colors.onBrand, overflow: "hidden" },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, marginBottom: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  agendaTitle: { color: colors.onSurface, fontSize: 16, fontFamily: font.heading, marginBottom: spacing.md },
  empty: { alignItems: "center", padding: 40, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, overflow: "hidden" },
  itemBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  itemTime: { width: 62 },
  itemTimeText: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  itemName: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  itemMember: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
});
