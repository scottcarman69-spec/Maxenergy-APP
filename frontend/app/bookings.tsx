import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Booking = { booking_id: string; class_name: string; status: string; amount: number; by_appointment?: boolean; requested_time?: string; scheduled_time?: string; attended?: boolean };

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE REQUESTED", bg: colors.surfaceTertiary, fg: colors.onSurface },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<Booking | null>(null);
  const [rTime, setRTime] = useState("");
  const [rNote, setRNote] = useState("");

  const load = useCallback(async () => {
    try {
      const b = await api.myBookings();
      setBookings(b.bookings || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doCancel = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      await api.cancelBooking(b.booking_id);
      setBanner("Booking cancelled. We've notified the gym.");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not cancel booking.");
    }
    setActioning(null);
  };

  const submitReschedule = async () => {
    if (!rescheduleFor || !rTime.trim()) return;
    setActioning(rescheduleFor.booking_id);
    try {
      await api.rescheduleBooking(rescheduleFor.booking_id, rTime.trim(), rNote.trim() || undefined);
      setBanner("Reschedule request sent. The gym will confirm a time.");
      setRescheduleFor(null);
      setRTime("");
      setRNote("");
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
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}>
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
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {canManage && (
                      <View style={styles.bookingActions}>
                        <Pressable
                          testID={`booking-reschedule-${b.booking_id}`}
                          style={styles.actionBtnGhost}
                          onPress={() => { setRescheduleFor(b); setRTime(""); setRNote(""); }}
                          disabled={actioning === b.booking_id}
                        >
                          <Ionicons name="time-outline" size={15} color={colors.brand} />
                          <Text style={styles.actionGhostText}>Reschedule</Text>
                        </Pressable>
                        <Pressable
                          testID={`booking-cancel-${b.booking_id}`}
                          style={styles.actionBtnDanger}
                          onPress={() => doCancel(b)}
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
            <Text style={styles.modalTitle}>Request a reschedule</Text>
            <Text style={styles.modalSub}>{rescheduleFor?.class_name}</Text>
            <Text style={styles.modalLabel}>Preferred day & time</Text>
            <TextInput
              testID="reschedule-time"
              value={rTime}
              onChangeText={setRTime}
              placeholder="e.g. Tuesday 6:00pm"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.modalInput}
            />
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
                style={[styles.modalSubmit, (!rTime.trim() || !!actioning) && { opacity: 0.5 }]}
                onPress={submitReschedule}
                disabled={!rTime.trim() || !!actioning}
              >
                {actioning ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>SEND REQUEST</Text>}
              </Pressable>
            </View>
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
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  notifDelete: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, borderRadius: radius.md, marginLeft: spacing.sm, gap: 2 },
  notifDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notifTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  notifBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  modalSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2, marginBottom: spacing.md },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.sm, marginBottom: 6 },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800" },
  modalSubmit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalSubmitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
