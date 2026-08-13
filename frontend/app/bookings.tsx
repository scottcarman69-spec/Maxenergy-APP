import React, { useCallback, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, RefreshControl, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, classStartMs } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";

type Booking = { booking_id: string; class_name: string; status: string; amount: number; by_appointment?: boolean; requested_time?: string; scheduled_time?: string; proposed_time?: string; attended?: boolean };
type ClassSlot = { class_id: string; name: string; start_at: string };

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE REQUESTED", bg: colors.surfaceTertiary, fg: colors.onSurface },
  admin_proposed: { label: "NEW TIME PROPOSED", bg: "#F59E0B", fg: "#1A1A1A" },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<Booking | null>(null);
  const [rDay, setRDay] = useState("");
  const [rSlot, setRSlot] = useState("");
  const [rNote, setRNote] = useState("");
  const [classSlots, setClassSlots] = useState<ClassSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rClassSlot, setRClassSlot] = useState<ClassSlot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const isAppt = !!rescheduleFor?.by_appointment;

  // For class bookings, load the gym's real upcoming sessions (24h+ out, same class first).
  useEffect(() => {
    if (!rescheduleFor || rescheduleFor.by_appointment) { setClassSlots([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const r = await api.classes();
        const cutoff = Date.now() + 24 * 3600 * 1000;
        const all: ClassSlot[] = (r.classes || [])
          .filter((c: any) => c.start_at && classStartMs(c.start_at) > cutoff)
          .sort((a: any, b: any) => classStartMs(a.start_at) - classStartMs(b.start_at));
        const sameName = all.filter((c) => c.name === rescheduleFor.class_name);
        if (!cancelled) setClassSlots(sameName.length ? sameName : all);
      } catch { if (!cancelled) setClassSlots([]); }
      if (!cancelled) setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [rescheduleFor]);

  // Next 14 days as pickable chips (label shown to member + sent to gym).
  const dayOptions = React.useMemo(() => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const out: { key: string; short: string; full: string }[] = [];
    const base = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      out.push({
        key: d.toISOString().slice(0, 10),
        short: `${days[d.getDay()].slice(0, 3)} ${d.getDate()} ${months[d.getMonth()]}`,
        full: `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`,
      });
    }
    return out;
  }, [rescheduleFor]);
  const timeSlots = React.useMemo(() => {
    const out: { v: string; label: string }[] = [];
    for (let h = 6; h <= 20; h++) for (const m of [0, 30]) {
      const ap = h < 12 ? "AM" : "PM"; const hh = h % 12 === 0 ? 12 : h % 12;
      out.push({ v: `${h}:${m}`, label: `${hh}:${String(m).padStart(2, "0")} ${ap}` });
    }
    return out;
  }, []);
  const rDayFull = dayOptions.find((d) => d.key === rDay)?.full || "";
  const rSlotLabel = timeSlots.find((s) => s.v === rSlot)?.label || "";
  const slotLabel = (c: ClassSlot) => `${classDate(c.start_at, { weekday: "short", day: "numeric", month: "short" })} · ${classTime(c.start_at)}`;
  const rComposed = isAppt
    ? (rDayFull && rSlotLabel ? `${rDayFull} · ${rSlotLabel}` : "")
    : (rClassSlot ? `${rClassSlot.name} · ${slotLabel(rClassSlot)}` : "");

  const load = useCallback(async () => {
    try {
      const b = await api.myBookings();
      setBookings(b.bookings || []);
    } catch {}
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doCancel = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      const res = await api.cancelBooking(b.booking_id);
      const bk = res?.booking || {};
      let extra = "";
      if (bk.cancel_reward === "class_pass") extra = " Your class pass has been returned.";
      else if (bk.cancel_reward === "credit" && bk.cancel_credit_cents)
        extra = ` $${(bk.cancel_credit_cents / 100).toFixed(2)} credit added to your account.`;
      setBanner("Booking cancelled." + extra + " We've notified the gym.");
      await load();
    } catch (e: any) {
      const msg = e?.message || "Could not cancel booking.";
      setBanner(msg);
      if (/24 hours/i.test(msg)) {
        Alert.alert("Too close to start time", msg);
      }
    }
    setActioning(null);
  };

  const confirmCancel = (b: Booking) => {
    Alert.alert(
      "Cancel booking?",
      `Cancel your ${b.class_name} booking?\n\nBookings can only be cancelled at least 24 hours before the start time. If you paid, we'll add it back as account credit (or return your class pass).`,
      [
        { text: "Keep booking", style: "cancel" },
        { text: "Cancel booking", style: "destructive", onPress: () => doCancel(b) },
      ],
    );
  };

  const confirmProposed = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      await api.confirmProposedTime(b.booking_id);
      setBanner("Great! Your session time is confirmed.");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not confirm the time.");
    }
    setActioning(null);
  };

  const submitReschedule = async () => {
    if (!rescheduleFor || !rComposed) return;
    setActioning(rescheduleFor.booking_id);
    try {
      await api.rescheduleBooking(rescheduleFor.booking_id, rComposed, rNote.trim() || undefined);
      setBanner("Reschedule request sent. The gym will confirm a time.");
      setRescheduleFor(null);
      setRDay(""); setRSlot(""); setRNote(""); setRClassSlot(null);
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not request reschedule.");
    }
    setActioning(null);
  };

  const clearBooking = (id: string) => {
    setBookings((cur) => cur.filter((x) => x.booking_id !== id));
    api.clearBooking(id).catch(() => {});
  };

  const clearAllBookings = async () => {
    setBookings([]);
    setBanner("Bookings cleared. You can still view them in your log.");
    try { await api.clearAllBookings(); } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="My Bookings"
        backTestID="bookings-back"
        fallback="/(tabs)/profile"
        right={
          <Pressable testID="booking-history" style={styles.logBtn} onPress={() => router.push("/booking-history")}>
            <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} />
            <Text style={styles.logBtnText}>Log</Text>
          </Pressable>
        }
      />

      {banner && (
        <Pressable testID="bookings-banner" style={styles.banner} onPress={() => setBanner(null)}>
          <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
        >
          {bookings.length > 0 && (
            <View style={styles.topRow}>
              <Text style={styles.countText}>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</Text>
              <Pressable testID="booking-clear-all" style={styles.sectionBtn} onPress={clearAllBookings}>
                <Ionicons name="trash-outline" size={14} color={colors.brand} />
                <Text style={[styles.sectionBtnText, { color: colors.brand }]}>Clear all</Text>
              </Pressable>
            </View>
          )}

          {bookings.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptyText}>Head to the Schedule to book your first class.</Text>
              <Pressable testID="bookings-browse" style={styles.browseBtn} onPress={() => router.replace("/(tabs)/timetable")}>
                <Text style={styles.browseBtnText}>Browse classes</Text>
              </Pressable>
            </View>
          ) : (
            bookings.map((b) => {
              const meta = STATUS_META[b.status] || { label: b.status.toUpperCase(), bg: colors.surfaceTertiary, fg: colors.onSurface };
              const canManage = b.status !== "cancelled";
              return (
                <Swipeable
                  key={b.booking_id}
                  renderRightActions={() => (
                    <Pressable testID={`booking-clear-${b.booking_id}`} style={styles.notifDelete} onPress={() => clearBooking(b.booking_id)}>
                      <Ionicons name="trash" size={20} color="#fff" />
                      <Text style={styles.notifDeleteText}>Clear</Text>
                    </Pressable>
                  )}
                  onSwipeableOpen={(direction) => { if (direction === "right") clearBooking(b.booking_id); }}
                  overshootRight={false}
                  rightThreshold={40}
                >
                  <View style={styles.bookingCard}>
                    <View style={styles.bookingRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notifTitle}>{b.class_name}</Text>
                        <Text style={styles.notifBody}>
                          {b.by_appointment ? "By appointment" : `$${(b.amount / 100).toFixed(0)}`}
                          {b.scheduled_time ? ` · ${b.scheduled_time}` : ""}
                          {b.status === "reschedule_requested" && b.requested_time ? ` · asked: ${b.requested_time}` : ""}
                          {b.status === "admin_proposed" && b.proposed_time ? ` · proposed: ${b.proposed_time}` : ""}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {b.status === "admin_proposed" && (
                      <View style={styles.proposeBox}>
                        <Text style={styles.proposeText}>
                          The gym proposed a new time{b.proposed_time ? `: ${b.proposed_time}` : ""}. Does this suit you?
                        </Text>
                        <Pressable
                          testID={`booking-confirm-time-${b.booking_id}`}
                          style={styles.proposeConfirmBtn}
                          onPress={() => confirmProposed(b)}
                          disabled={actioning === b.booking_id}
                        >
                          {actioning === b.booking_id ? (
                            <ActivityIndicator size="small" color={colors.onBrand} />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={16} color={colors.onBrand} />
                              <Text style={styles.proposeConfirmText}>This time works</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                    {canManage && (
                      <View style={styles.bookingActions}>
                        <Pressable
                          testID={`booking-reschedule-${b.booking_id}`}
                          style={styles.actionBtnGhost}
                          onPress={() => { setRescheduleFor(b); setRDay(""); setRSlot(""); setRNote(""); setRClassSlot(null); }}
                          disabled={actioning === b.booking_id}
                        >
                          <Ionicons name="time-outline" size={15} color={colors.brand} />
                          <Text style={styles.actionGhostText}>Reschedule</Text>
                        </Pressable>
                        <Pressable
                          testID={`booking-cancel-${b.booking_id}`}
                          style={styles.actionBtnDanger}
                          onPress={() => confirmCancel(b)}
                          disabled={actioning === b.booking_id}
                        >
                          {actioning === b.booking_id ? (
                            <ActivityIndicator size="small" color={colors.error} />
                          ) : (
                            <>
                              <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                              <Text style={styles.actionDangerText}>Cancel</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                    {(b.status === "paid" || b.status === "confirmed") && (
                      <Pressable
                        testID={`booking-receipt-${b.booking_id}`}
                        style={styles.receiptBtn}
                        onPress={() => router.push({ pathname: "/receipt", params: { booking_id: b.booking_id } })}
                      >
                        <Ionicons name="receipt-outline" size={15} color={colors.brand} />
                        <Text style={styles.receiptBtnText}>View receipt</Text>
                      </Pressable>
                    )}
                    {(b.status === "paid" || b.status === "confirmed") && (
                      b.attended ? (
                        <View style={styles.checkedInBar}>
                          <Ionicons name="checkmark-circle" size={16} color="#fff" />
                          <Text style={styles.checkedInText}>Checked in — see you on the mats!</Text>
                        </View>
                      ) : (
                        <Pressable
                          testID={`booking-qr-${b.booking_id}`}
                          style={styles.qrInfoBar}
                          onPress={() => router.push({ pathname: "/check-in", params: { booking_id: b.booking_id } })}
                        >
                          <Ionicons name="qr-code" size={16} color={colors.brand} />
                          <Text style={styles.qrInfoText}>Show entry QR code</Text>
                          <Ionicons name="chevron-forward" size={15} color={colors.brand} />
                        </Pressable>
                      )
                    )}
                  </View>
                </Swipeable>
              );
            })
          )}
          {bookings.length > 0 && <Text style={styles.swipeHint}>Swipe a booking left to clear it</Text>}
        </ScrollView>
      )}

      <Modal visible={!!rescheduleFor} transparent animationType="fade" onRequestClose={() => setRescheduleFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>
            <Text style={styles.modalTitle}>Request a reschedule</Text>
            <Text style={styles.modalSub}>{rescheduleFor?.class_name}</Text>
            <Text style={styles.modalHint}>Reschedules must be at least 24 hours before your booking.</Text>

            {isAppt ? (
              <>
                <Text style={styles.modalLabel}>Pick a day</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {dayOptions.map((d) => {
                    const on = rDay === d.key;
                    return (
                      <Pressable key={d.key} testID={`rday-${d.key}`} style={[styles.pickChip, on && styles.pickChipOn]} onPress={() => setRDay(d.key)}>
                        <Text style={[styles.pickChipText, on && styles.pickChipTextOn]}>{d.short}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={styles.modalLabel}>Pick a time</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {timeSlots.map((s) => {
                    const on = rSlot === s.v;
                    return (
                      <Pressable key={s.v} testID={`rslot-${s.v}`} style={[styles.pickChip, on && styles.pickChipOn]} onPress={() => setRSlot(s.v)}>
                        <Text style={[styles.pickChipText, on && styles.pickChipTextOn]}>{s.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.modalLabel}>Pick a session</Text>
                {loadingSlots ? (
                  <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} />
                ) : classSlots.length === 0 ? (
                  <Text style={styles.modalHint}>No upcoming sessions 24h+ away. Please contact the gym.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator>
                    {classSlots.map((c) => {
                      const on = rClassSlot?.class_id === c.class_id && rClassSlot?.start_at === c.start_at;
                      return (
                        <Pressable key={`${c.class_id}-${c.start_at}`} testID={`rclass-${c.class_id}`} style={[styles.slotRow, on && styles.slotRowOn]} onPress={() => setRClassSlot(c)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.slotName}>{c.name}</Text>
                            <Text style={styles.slotWhen}>{classDate(c.start_at, { weekday: "long", day: "numeric", month: "short" })} · {classTime(c.start_at)}</Text>
                          </View>
                          {on && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {!!rComposed && <Text style={styles.rComposed}>Preferred: {rComposed}</Text>}

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              testID="reschedule-note"
              value={rNote}
              onChangeText={setRNote}
              placeholder="Anything the gym should know"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              style={[styles.modalInput, { minHeight: 70, textAlignVertical: "top" }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRescheduleFor(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="reschedule-submit"
                style={[styles.modalSubmit, (!rComposed || !!actioning) && { opacity: 0.5 }]}
                onPress={submitReschedule}
                disabled={!rComposed || !!actioning}
              >
                {actioning ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>SEND REQUEST</Text>}
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
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logBtnText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "800" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  countText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  sectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  sectionBtnText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "800" },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  browseBtn: { backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.lg },
  browseBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  swipeHint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.7 },
  bookingRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, gap: spacing.md },
  bookingCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  bookingActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  qrInfoBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qrInfoText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "600" },
  receiptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  receiptBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  checkedInBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#16A34A" },
  checkedInText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border },
  actionGhostText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  actionBtnDanger: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionDangerText: { color: colors.error, fontWeight: "800", fontSize: 13 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  proposeBox: { marginTop: spacing.sm, backgroundColor: "#F59E0B22", borderWidth: 1, borderColor: "#F59E0B", borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  proposeText: { color: colors.onSurface, fontSize: 13.5, lineHeight: 19 },
  proposeConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.md },
  proposeConfirmText: { color: colors.onBrand, fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  notifDelete: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, borderRadius: radius.md, marginLeft: spacing.sm, gap: 2 },
  notifDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notifTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  notifBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, maxHeight: "85%" },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  modalSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2, marginBottom: spacing.md },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.sm, marginBottom: 6 },
  modalHint: { color: colors.brand, fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  pickChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  pickChipOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  pickChipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800" },
  pickChipTextOn: { color: colors.brand },
  rComposed: { color: colors.onSurface, fontSize: 13.5, fontWeight: "800", marginTop: spacing.sm },
  slotRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 },
  slotRowOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  slotName: { color: colors.onSurface, fontSize: 14.5, fontWeight: "800" },
  slotWhen: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800" },
  modalSubmit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalSubmitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
