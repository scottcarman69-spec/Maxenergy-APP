import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string };
type Booking = { booking_id: string; class_name: string; status: string; amount: number; by_appointment?: boolean; requested_time?: string; scheduled_time?: string; attended?: boolean };

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE REQUESTED", bg: colors.surfaceTertiary, fg: colors.onSurface },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [pdfApp, setPdfApp] = useState<{ application_id: string; plan_name?: string } | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<Booking | null>(null);
  const [rTime, setRTime] = useState("");
  const [rNote, setRNote] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, b, a] = await Promise.all([api.notifications(), api.myBookings(), api.myApplications()]);
      setNotifs(n.notifications || []);
      setBookings(b.bookings || []);
      const apps = a.applications || [];
      setIsMember(apps.some((x: any) => x.status === "approved"));
      setPdfApp(apps.find((x: any) => x.pdf_filename) || null);
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

  const doCheckin = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      await api.checkinBooking(b.booking_id);
      setBanner("✅ You're checked in. Have a great session!");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not check in.");
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

  const doLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const doDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      setShowDelete(false);
      await logout();
      router.replace("/(auth)/login");
    } catch (e: any) {
      setShowDelete(false);
      setBanner(e?.message || "Could not delete your account. Please try again.");
    }
    setDeleting(false);
  };

  const paidCount = bookings.filter((b) => b.status === "paid" || b.status === "confirmed").length;
  const unread = notifs.filter((n) => !n.read).length;

  const deleteNotif = (id: string) => {
    setNotifs((cur) => cur.filter((x) => x.notification_id !== id));
    api.deleteNotification(id).catch(() => {});
  };

  const clearAllNotifs = async () => {
    setNotifs([]);
    setBanner("Notifications cleared. You can still view them in your log.");
    try { await api.clearAllNotifications(); } catch {}
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

  const links = [
    { key: "inbox", icon: "chatbubbles", label: "Message the Gym", onPress: () => router.push("/(tabs)/inbox") },
    { key: "membership", icon: "card", label: "Membership Application", onPress: () => router.push("/membership") },
    { key: "services", icon: "barbell", label: "Our Services", onPress: () => router.push("/services") },
    { key: "about", icon: "people", label: "About Us & Team", onPress: () => router.push("/about") },
    { key: "contact", icon: "call", label: "Contact & Gym Info", onPress: () => router.push("/contact") },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name || "Member"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badgeRow}>
            {isMember && (
              <View style={styles.memberBadge}>
                <Ionicons name="star" size={12} color={colors.onBrand} />
                <Text style={styles.memberBadgeText}>ACTIVE MEMBER</Text>
              </View>
            )}
            {user?.is_admin && (
              <View style={styles.adminBadge}>
                <Ionicons name="shield-checkmark" size={12} color={colors.onBrand} />
                <Text style={styles.adminBadgeText}>ADMIN</Text>
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{paidCount}</Text>
              <Text style={styles.statLabel}>BOOKED</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{bookings.length}</Text>
              <Text style={styles.statLabel}>TOTAL</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{unread}</Text>
              <Text style={styles.statLabel}>UNREAD</Text>
            </View>
          </View>
        </View>

        {user?.is_admin && (
          <Pressable testID="open-admin-dashboard" style={styles.adminCta} onPress={() => router.push("/admin")}>
            <Ionicons name="construct" size={18} color={colors.onBrand} />
            <Text style={styles.adminCtaText}>ADMIN DASHBOARD</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onBrand} style={{ marginLeft: "auto" }} />
          </Pressable>
        )}

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.lg }}>
          {links.map((l) => (
            <Pressable key={l.key} testID={`profile-link-${l.key}`} style={styles.linkRow} onPress={l.onPress}>
              <View style={styles.linkIcon}>
                <Ionicons name={l.icon as any} size={18} color={colors.brand} />
              </View>
              <Text style={styles.linkLabel}>{l.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          ))}
          {pdfApp && (
            <Pressable
              testID="profile-download-form"
              style={styles.downloadRow}
              onPress={() => Linking.openURL(`${BACKEND_URL}/api/membership/forms/${pdfApp.application_id}.pdf`)}
            >
              <View style={styles.downloadIcon}>
                <Ionicons name="document-text" size={18} color={colors.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.downloadLabel}>Download my membership form</Text>
                <Text style={styles.downloadSub}>PDF copy of your completed form</Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.brand} />
            </Pressable>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>NOTIFICATIONS</Text>
          <View style={styles.sectionActions}>
            <Pressable testID="notif-history" style={styles.sectionBtn} onPress={() => router.push("/notification-history")}>
              <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} />
              <Text style={styles.sectionBtnText}>Log</Text>
            </Pressable>
            {notifs.length > 0 && (
              <Pressable testID="notif-clear-all" style={styles.sectionBtn} onPress={clearAllNotifs}>
                <Ionicons name="trash-outline" size={14} color={colors.brand} />
                <Text style={[styles.sectionBtnText, { color: colors.brand }]}>Clear all</Text>
              </Pressable>
            )}
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
        ) : notifs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={28} color={colors.onSurfaceSecondary} />
            <Text style={styles.emptyText}>{"You're all caught up."}</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {notifs.slice(0, 8).map((n) => (
              <Swipeable
                key={n.notification_id}
                renderRightActions={() => (
                  <Pressable
                    testID={`notif-delete-${n.notification_id}`}
                    style={styles.notifDelete}
                    onPress={() => deleteNotif(n.notification_id)}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.notifDeleteText}>Clear</Text>
                  </Pressable>
                )}
                onSwipeableOpen={(direction) => {
                  if (direction === "right") deleteNotif(n.notification_id);
                }}
                overshootRight={false}
                rightThreshold={40}
              >
                <Pressable
                  testID={`notif-${n.notification_id}`}
                  style={styles.notifRow}
                  onPress={() => {
                    if (!n.read) {
                      api.markRead(n.notification_id).catch(() => {});
                      setNotifs((cur) => cur.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)));
                    }
                  }}
                >
                  {!n.read && <View style={styles.unreadDot} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifTitle}>{n.title}</Text>
                    <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
                  </View>
                  <Ionicons name="chevron-back" size={16} color={colors.onSurfaceSecondary} style={{ opacity: 0.5 }} />
                </Pressable>
              </Swipeable>
            ))}
            <Text style={styles.swipeHint}>Swipe a notification left to clear it</Text>
          </View>
        )}

        <View style={styles.sectionRow}>
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>MY BOOKINGS</Text>
          <View style={styles.sectionActions}>
            <Pressable testID="booking-history" style={styles.sectionBtn} onPress={() => router.push("/booking-history")}>
              <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} />
              <Text style={styles.sectionBtnText}>Log</Text>
            </Pressable>
            {bookings.length > 0 && (
              <Pressable testID="booking-clear-all" style={styles.sectionBtn} onPress={clearAllBookings}>
                <Ionicons name="trash-outline" size={14} color={colors.brand} />
                <Text style={[styles.sectionBtnText, { color: colors.brand }]}>Clear all</Text>
              </Pressable>
            )}
          </View>
        </View>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {bookings.length === 0 ? (
            <Text style={styles.emptyInline}>No bookings yet. Head to the Schedule to book a class.</Text>
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
                    b.attended ? (
                      <View style={styles.checkedInBar}>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.checkedInText}>Checked in — see you on the mats!</Text>
                      </View>
                    ) : (
                      <Pressable
                        testID={`booking-checkin-${b.booking_id}`}
                        style={styles.checkinBar}
                        onPress={() => doCheckin(b)}
                        disabled={actioning === b.booking_id}
                      >
                        {actioning === b.booking_id ? (
                          <ActivityIndicator size="small" color={colors.onBrand} />
                        ) : (
                          <>
                            <Ionicons name="log-in-outline" size={16} color={colors.onBrand} />
                            <Text style={styles.checkinText}>Check in to this class</Text>
                          </>
                        )}
                      </Pressable>
                    )
                  )}
                </View>
                </Swipeable>
              );
            })
          )}
        </View>

        {banner && (
          <Pressable onPress={() => setBanner(null)} style={styles.banner}>
            <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
            <Text style={styles.bannerText}>{banner}</Text>
          </Pressable>
        )}

        <Pressable testID="logout-button" style={styles.logout} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        {!user?.is_admin && (
          <Pressable testID="delete-account-button" style={styles.deleteAccount} onPress={() => setShowDelete(true)}>
            <Ionicons name="trash-outline" size={16} color={colors.onSurfaceSecondary} />
            <Text style={styles.deleteAccountText}>Delete my account</Text>
          </Pressable>
        )}
      </ScrollView>

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

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.deleteWarn}>
              This permanently removes your account and all your data — bookings, applications, trial claims, messages and notifications. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable testID="delete-cancel" style={styles.modalCancel} onPress={() => setShowDelete(false)} disabled={deleting}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="delete-confirm"
                style={[styles.deleteConfirm, deleting && { opacity: 0.6 }]}
                onPress={doDeleteAccount}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteConfirmText}>DELETE ACCOUNT</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { alignItems: "center", padding: spacing.xl, gap: spacing.xs },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  avatarText: { color: colors.onBrand, fontSize: 34, fontWeight: "900" },
  name: { ...type.h2 },
  email: { ...type.bodyDim, marginTop: 2 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  adminBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  memberBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#16A34A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  memberBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  statsRow: { flexDirection: "row", marginTop: spacing.xl, gap: spacing.md, alignSelf: "stretch" },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  adminCta: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  adminCtaText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  linkLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15, flex: 1 },
  downloadRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand },
  downloadIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  downloadLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15 },
  downloadSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  section: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  sectionActions: { flexDirection: "row", gap: spacing.sm },
  sectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  sectionBtnText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "800" },
  notifRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  notifDelete: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, borderRadius: radius.md, marginLeft: spacing.sm, gap: 2 },
  notifDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  swipeHint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.7 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  notifTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  notifBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  emptyInline: { color: colors.onSurfaceSecondary, fontSize: 13, paddingVertical: spacing.md },
  bookingRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  bookingCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  bookingActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  checkinBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.brand },
  checkinText: { color: colors.onBrand, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
  checkedInBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#16A34A" },
  checkedInText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border },
  actionGhostText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  actionBtnDanger: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionDangerText: { color: colors.error, fontWeight: "800", fontSize: 13 },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  paid: { backgroundColor: colors.brand },
  pending: { backgroundColor: colors.surfaceTertiary },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
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
  logout: { marginTop: spacing.xxl, marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: spacing.sm },
  logoutText: { color: colors.error, fontWeight: "800", letterSpacing: 0.5 },
  deleteAccount: { marginTop: spacing.md, marginHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  deleteAccountText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 13, textDecorationLine: "underline" },
  deleteWarn: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, marginBottom: spacing.lg },
  deleteConfirm: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.error },
  deleteConfirmText: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
});
