import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { classTime, classDate, qldTodayUTC, qldNowUTC } from "@/src/datetime";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  requested_time?: string;
  requested_at?: string;
  scheduled_time?: string;
  proposed_time?: string;
  member_name?: string;
  member_email?: string;
  booking_no?: number;
  created_at?: string;
  attended?: boolean;
  paid_via?: string;
  is_paid?: boolean;
};

const PAID_VIA_LABEL: Record<string, string> = {
  square: "Square", credit: "Credit", class_pass: "Class Pass", test_free: "Test",
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.success, fg: "#fff" },
  confirmed: { label: "CONFIRMED", bg: colors.success, fg: "#fff" },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE ASK", bg: "#B45309", fg: "#fff" },
  admin_proposed: { label: "AWAITING MEMBER", bg: "#F59E0B", fg: "#1A1A1A" },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

const FILTERS = ["Active", "Requests", "All"] as const;

export default function AdminBookings() {
  const router = useRouter();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Active");
  const [actioning, setActioning] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<Booking | null>(null);
  const [rDayIdx, setRDayIdx] = useState<number | null>(null);
  const [rMins, setRMins] = useState<number | null>(null); // minutes since midnight
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

  const isApptResched = !!rescheduleFor?.by_appointment;

  // Days: appointments are Mon–Thu only; class bookings can use any of the next 14 days.
  const rDays = React.useMemo(() => {
    const base = qldTodayUTC();
    const out: Date[] = [];
    for (let i = 0; i < 21 && out.length < 14; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
      const wd = d.getUTCDay(); // Sun=0 .. Sat=6
      if (isApptResched && !(wd >= 1 && wd <= 4)) continue; // Mon–Thu only for appointments
      out.push(d);
    }
    return out;
  }, [rescheduleFor]);
  // Slots: appointments 10:30am–4:00pm; class bookings 6:00am–8:00pm.
  const R_SLOTS = React.useMemo(() => {
    const out: number[] = [];
    const start = isApptResched ? 10 * 60 + 30 : 6 * 60;
    const end = isApptResched ? 16 * 60 : 20 * 60;
    for (let mins = start; mins <= end; mins += 30) out.push(mins);
    return out;
  }, [rescheduleFor]);
  const slotIso = (d: Date, mins: number) => {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  };
  const rChosenIso = rDayIdx !== null && rMins !== null ? slotIso(rDays[rDayIdx], rMins) : null;
  const rChosenLabel = rChosenIso
    ? `${classDate(rChosenIso, { weekday: "short", day: "2-digit", month: "short" })} · ${classTime(rChosenIso)}`
    : "";
  const openReschedule = async (b: Booking) => {
    setRescheduleFor(b);
    setRDayIdx(null);
    setRMins(null);
    setNote("");
    setTakenSlots(new Set());
    if (b.by_appointment) {
      try {
        const r = await api.appointmentsTaken();
        // Don't treat this booking's own slot as taken.
        const own = b.requested_at || "";
        setTakenSlots(new Set((r.taken || []).filter((t: string) => t !== own)));
      } catch { /* ignore */ }
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await api.adminBookings();
      setRows(r.bookings || []);
    } catch (e: any) {
      setBanner(e?.message || "Failed to load bookings");
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (id: string, fn: () => Promise<any>, msg: string) => {
    setActioning(id);
    try {
      await fn();
      setBanner(msg);
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Action failed");
    }
    setActioning(null);
  };

  const submitReschedule = async () => {
    if (!rescheduleFor || !rChosenIso) return;
    const id = rescheduleFor.booking_id;
    setActioning(id);
    try {
      await api.adminRescheduleBooking(id, rChosenLabel, note.trim() || undefined, rChosenIso);
      setBanner("New time proposed & member notified.");
      setRescheduleFor(null);
      setRDayIdx(null);
      setRMins(null);
      setNote("");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Action failed");
    }
    setActioning(null);
  };

  const filtered = rows.filter((b) => {
    if (filter === "All") return true;
    if (filter === "Requests") return b.status === "reschedule_requested" || (b.by_appointment && (b.status === "pending" || b.status === "paid"));
    return b.status !== "cancelled"; // Active
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Bookings" backTestID="adminbk-back" fallback="/admin" />

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f} testID={`adminbk-filter-${f}`} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipOn]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {banner && (
        <Pressable onPress={() => setBanner(null)} style={styles.banner}>
          <Ionicons name="information-circle" size={16} color={colors.brand} />
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No bookings here.</Text>
            </View>
          ) : (
            filtered.map((b) => {
              const meta = STATUS_META[b.status] || { label: b.status.toUpperCase(), bg: colors.surfaceTertiary, fg: colors.onSurface };
              const busy = actioning === b.booking_id;
              const paidViaSquare = b.paid_via === "square";
              return (
                <View key={b.booking_id} testID={`adminbk-row-${b.booking_id}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={styles.className} numberOfLines={1}>{b.class_name}</Text>
                        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.member} numberOfLines={1}>{b.member_name}{b.member_email ? ` · ${b.member_email}` : ""}</Text>
                      <View style={styles.metaRow}>
                        {!!b.booking_no && <Text style={styles.metaChip}>No. {b.booking_no}</Text>}
                        <Text style={styles.metaChip}>{b.by_appointment ? "Appointment" : `$${(b.amount / 100).toFixed(0)}`}</Text>
                        {b.is_paid && (
                          <View style={styles.paidChip}>
                            <Ionicons name="checkmark-circle" size={12} color="#fff" />
                            <Text style={styles.paidChipText}>PAID{b.paid_via ? ` · ${PAID_VIA_LABEL[b.paid_via] || "Card"}` : ""}</Text>
                          </View>
                        )}
                      </View>
                      {(b.scheduled_time || b.requested_time || (b.status === "admin_proposed" && b.proposed_time)) && (
                        <Text style={styles.timeLine} numberOfLines={1}>
                          {b.scheduled_time ? `Confirmed: ${b.scheduled_time}`
                            : b.status === "admin_proposed" && b.proposed_time ? `Proposed: ${b.proposed_time}`
                            : `Preferred: ${b.requested_time}`}
                        </Text>
                      )}
                    </View>
                  </View>

                  {b.status !== "cancelled" && (
                    <View style={styles.actions}>
                      {(b.status === "pending" || b.status === "reschedule_requested") && (
                        <Pressable
                          testID={`adminbk-accept-${b.booking_id}`}
                          style={[styles.actBtn, styles.actAccept]}
                          disabled={busy}
                          onPress={() => act(b.booking_id, () => api.adminAcceptBooking(b.booking_id), "Accepted & member notified.")}
                        >
                          {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : (<><Ionicons name="checkmark" size={14} color={colors.onBrand} /><Text style={styles.actAcceptText}>Accept</Text></>)}
                        </Pressable>
                      )}
                      {b.by_appointment && b.status === "paid" && (
                        <Pressable
                          testID={`adminbk-confirm-${b.booking_id}`}
                          style={[styles.actBtn, styles.actAccept]}
                          disabled={busy}
                          onPress={() => act(b.booking_id, () => api.adminConfirmBooking(b.booking_id), "Confirmed & member notified.")}
                        >
                          {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : (<><Ionicons name="checkmark-done" size={14} color={colors.onBrand} /><Text style={styles.actAcceptText}>Confirm</Text></>)}
                        </Pressable>
                      )}
                      {b.by_appointment && (
                        <Pressable
                          testID={`adminbk-reschedule-${b.booking_id}`}
                          style={[styles.actBtn, styles.actGhost]}
                          disabled={busy}
                          onPress={() => openReschedule(b)}
                        >
                          <Ionicons name="time-outline" size={14} color={colors.brand} />
                          <Text style={styles.actGhostText}>Suggest time</Text>
                        </Pressable>
                      )}
                      {b.by_appointment && (
                        <Pressable
                          testID={`adminbk-attend-${b.booking_id}`}
                          style={[styles.actBtn, b.attended ? styles.actAttendOn : styles.actGhost]}
                          disabled={busy}
                          onPress={() => act(b.booking_id, () => api.adminSetAttendance(b.booking_id, !b.attended), b.attended ? "Marked as not attended." : "Marked as attended ✓")}
                        >
                          <Ionicons name={b.attended ? "checkmark-circle" : "person-add-outline"} size={14} color={b.attended ? "#fff" : colors.brand} />
                          <Text style={b.attended ? styles.actAttendOnText : styles.actGhostText}>{b.attended ? "Attended" : "Attended?"}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        testID={`adminbk-cancel-${b.booking_id}`}
                        style={[styles.actBtn, styles.actDanger]}
                        disabled={busy}
                        onPress={() => act(b.booking_id, () => api.adminCancelBooking(b.booking_id), "Cancelled & member notified.")}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={colors.error} />
                        <Text style={styles.actDangerText}>Cancel</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={!!rescheduleFor} transparent animationType="fade" onRequestClose={() => setRescheduleFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Suggest a new time</Text>
            <Text style={styles.modalSub}>{rescheduleFor?.class_name} · {rescheduleFor?.member_name}</Text>
            {!!rescheduleFor?.requested_time && (
              <Text style={styles.modalHint}>Member's preferred time: {rescheduleFor?.requested_time}</Text>
            )}

            <Text style={styles.modalLabel}>Pick a day{isApptResched ? " (Mon–Thu only)" : ""}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
              {rDays.map((d, i) => {
                const active = i === rDayIdx;
                return (
                  <Pressable
                    key={i}
                    testID={`adminbk-day-${i}`}
                    onPress={() => { setRDayIdx(i); setRMins(null); }}
                    style={[styles.dayChip, active && styles.chipActive]}
                  >
                    <Text style={[styles.dayChipLabel, active && styles.chipTextActive]}>
                      {d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })}
                    </Text>
                    <Text style={[styles.dayChipNum, active && styles.chipTextActive]}>{d.getUTCDate()}</Text>
                    <Text style={[styles.dayChipMon, active && styles.chipTextActive]}>
                      {d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.modalLabel}>Pick a time{isApptResched ? " (10:30am–4:00pm)" : ""}</Text>
            <View style={styles.slotWrap}>
              {R_SLOTS.map((mins) => {
                const iso = rDayIdx !== null ? slotIso(rDays[rDayIdx], mins) : "";
                const isPast = rDayIdx !== null && (iso <= (() => {
                  const n = qldNowUTC();
                  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}T${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}:00`;
                })());
                const isTaken = isApptResched && !!iso && takenSlots.has(iso);
                const disabled = rDayIdx === null || isPast || isTaken;
                const active = mins === rMins;
                const h = Math.floor(mins / 60), m = mins % 60;
                const label = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
                return (
                  <Pressable
                    key={mins}
                    testID={`adminbk-slot-${mins}`}
                    disabled={disabled}
                    onPress={() => setRMins(mins)}
                    style={[styles.slotChip, active && styles.chipActive, disabled && { opacity: 0.3 }, isTaken && styles.slotTaken]}
                  >
                    <Text style={[styles.slotChipText, active && styles.chipTextActive]}>{label}</Text>
                    {isTaken && <Text style={styles.slotTakenText}>booked</Text>}
                  </Pressable>
                );
              })}
            </View>

            {!!rChosenLabel && (
              <Text style={styles.chosenLine}>New time: <Text style={{ fontWeight: "800", color: colors.brand }}>{rChosenLabel}</Text></Text>
            )}

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              testID="adminbk-note"
              value={note}
              onChangeText={setNote}
              placeholder="Message to the member"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              style={[styles.modalInput, { minHeight: 60, textAlignVertical: "top" }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRescheduleFor(null)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable
                testID="adminbk-reschedule-submit"
                style={[styles.modalSubmit, (!rChosenIso || !!actioning) && { opacity: 0.5 }]}
                onPress={submitReschedule}
                disabled={!rChosenIso || !!actioning}
              >
                {actioning ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>PROPOSE & NOTIFY</Text>}
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  filters: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  filterTextOn: { color: colors.onBrand },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardTop: { padding: 11 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  className: { flex: 1, color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  member: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 5 },
  metaChip: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  paidChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  paidChipText: { color: "#fff", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.3 },
  timeLine: { color: colors.onSurface, fontSize: 11.5, marginTop: 4, fontWeight: "600" },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 0.4 },
  actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 9 },
  actAccept: { backgroundColor: colors.brand },
  actAcceptText: { color: colors.onBrand, fontWeight: "800", fontSize: 12 },
  actGhost: { borderRightWidth: 1, borderRightColor: colors.border, borderLeftWidth: 1, borderLeftColor: colors.border },
  actGhostText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  actAttendOn: { backgroundColor: colors.success, borderRightWidth: 1, borderRightColor: colors.border, borderLeftWidth: 1, borderLeftColor: colors.border },
  actAttendOnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  actDanger: {},
  actDangerText: { color: colors.error, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, maxHeight: "88%" },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  modalSub: { color: colors.brand, fontSize: 13, fontWeight: "700", marginTop: 2 },
  modalHint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: spacing.sm },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.md, marginBottom: 6 },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800" },
  modalSubmit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalSubmitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  dayChip: { alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, minWidth: 58 },
  dayChipLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dayChipNum: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  dayChipMon: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTextActive: { color: colors.onBrand },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slotChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  slotChipText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  slotTaken: { borderColor: colors.error },
  slotTakenText: { color: colors.error, fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginTop: 1 },
  chosenLine: { color: colors.onSurface, fontSize: 14, marginTop: spacing.md },
});
