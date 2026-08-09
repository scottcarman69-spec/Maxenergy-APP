import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  requested_time?: string;
  scheduled_time?: string;
  member_name?: string;
  member_email?: string;
  created_at?: string;
  attended?: boolean;
};

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE ASK", bg: "#B45309", fg: "#fff" },
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
  const [newTime, setNewTime] = useState("");
  const [note, setNote] = useState("");
  const [banner, setBanner] = useState<string | null>(null);

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
    if (!rescheduleFor || !newTime.trim()) return;
    const id = rescheduleFor.booking_id;
    setActioning(id);
    try {
      await api.adminRescheduleBooking(id, newTime.trim(), note.trim() || undefined);
      setBanner("Rescheduled & member notified.");
      setRescheduleFor(null);
      setNewTime("");
      setNote("");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Action failed");
    }
    setActioning(null);
  };

  const filtered = rows.filter((b) => {
    if (filter === "All") return true;
    if (filter === "Requests") return b.status === "reschedule_requested" || (b.by_appointment && b.status === "pending");
    return b.status !== "cancelled"; // Active
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="adminbk-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Bookings</Text>
        <View style={{ width: 26 }} />
      </View>

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
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="clipboard-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No bookings here.</Text>
            </View>
          ) : (
            filtered.map((b) => {
              const meta = STATUS_META[b.status] || { label: b.status.toUpperCase(), bg: colors.surfaceTertiary, fg: colors.onSurface };
              const busy = actioning === b.booking_id;
              return (
                <View key={b.booking_id} testID={`adminbk-row-${b.booking_id}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.className}>{b.class_name}</Text>
                      <Text style={styles.member}>{b.member_name}{b.member_email ? ` · ${b.member_email}` : ""}</Text>
                      <Text style={styles.meta}>
                        {b.by_appointment ? "By appointment" : `$${(b.amount / 100).toFixed(0)}`}
                        {b.scheduled_time ? ` · confirmed: ${b.scheduled_time}` : ""}
                        {b.status === "reschedule_requested" && b.requested_time ? ` · asked: ${b.requested_time}` : ""}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
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
                          {busy ? <ActivityIndicator size="small" color={colors.onBrand} /> : (<><Ionicons name="checkmark" size={15} color={colors.onBrand} /><Text style={styles.actAcceptText}>Accept</Text></>)}
                        </Pressable>
                      )}
                      <Pressable
                        testID={`adminbk-reschedule-${b.booking_id}`}
                        style={[styles.actBtn, styles.actGhost]}
                        disabled={busy}
                        onPress={() => { setRescheduleFor(b); setNewTime(b.requested_time || ""); setNote(""); }}
                      >
                        <Ionicons name="time-outline" size={15} color={colors.brand} />
                        <Text style={styles.actGhostText}>Reschedule</Text>
                      </Pressable>
                      <Pressable
                        testID={`adminbk-cancel-${b.booking_id}`}
                        style={[styles.actBtn, styles.actDanger]}
                        disabled={busy}
                        onPress={() => act(b.booking_id, () => api.adminCancelBooking(b.booking_id), "Cancelled & member notified.")}
                      >
                        <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                        <Text style={styles.actDangerText}>Cancel</Text>
                      </Pressable>
                    </View>
                  )}
                  {b.status !== "cancelled" && (
                    <Pressable
                      testID={`adminbk-attend-${b.booking_id}`}
                      style={[styles.attendBar, b.attended && styles.attendBarOn]}
                      disabled={busy}
                      onPress={() => act(b.booking_id, () => api.adminSetAttendance(b.booking_id, !b.attended), b.attended ? "Marked as not attended." : "Marked as attended ✓")}
                    >
                      <Ionicons name={b.attended ? "checkmark-circle" : "person-add-outline"} size={16} color={b.attended ? "#fff" : colors.onSurface} />
                      <Text style={[styles.attendText, b.attended && { color: "#fff" }]}>
                        {b.attended ? "Attended ✓  (tap to undo)" : "Mark as attended"}
                      </Text>
                    </Pressable>
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
            <Text style={styles.modalTitle}>Confirm new time</Text>
            <Text style={styles.modalSub}>{rescheduleFor?.class_name} · {rescheduleFor?.member_name}</Text>
            {!!rescheduleFor?.requested_time && (
              <Text style={styles.modalHint}>Member asked for: {rescheduleFor?.requested_time}</Text>
            )}
            <Text style={styles.modalLabel}>Confirmed day & time</Text>
            <TextInput
              testID="adminbk-newtime"
              value={newTime}
              onChangeText={setNewTime}
              placeholder="e.g. Tuesday 6:00pm"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              testID="adminbk-note"
              value={note}
              onChangeText={setNote}
              placeholder="Message to the member"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              style={[styles.modalInput, { minHeight: 70, textAlignVertical: "top" }]}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRescheduleFor(null)}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable
                testID="adminbk-reschedule-submit"
                style={[styles.modalSubmit, (!newTime.trim() || !!actioning) && { opacity: 0.5 }]}
                onPress={submitReschedule}
                disabled={!newTime.trim() || !!actioning}
              >
                {actioning ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>CONFIRM & NOTIFY</Text>}
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
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  filters: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  filterTextOn: { color: colors.onBrand },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md },
  className: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  member: { color: colors.onSurface, fontSize: 12, marginTop: 3 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 12 },
  actAccept: { backgroundColor: colors.brand },
  actAcceptText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 },
  actGhost: { borderRightWidth: 1, borderRightColor: colors.border, borderLeftWidth: 1, borderLeftColor: colors.border },
  actGhostText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  actDanger: {},
  actDangerText: { color: colors.error, fontWeight: "800", fontSize: 13 },
  attendBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  attendBarOn: { backgroundColor: "#16A34A" },
  attendText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
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
});
