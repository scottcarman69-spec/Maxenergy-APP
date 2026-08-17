import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, Image, Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string };
type Booking = { booking_id: string; class_name: string; status: string; amount: number; by_appointment?: boolean; requested_time?: string; scheduled_time?: string; attended?: boolean };

export default function Profile() {
  const { user, logout, refresh } = useAuth();
  const router = useRouter();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const pickPhoto = async () => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert("Photo access needed", "Enable photo access to set your profile picture.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const dataUri = `data:image/jpeg;base64,${res.assets[0].base64}`;
    setUploadingPhoto(true);
    try { await api.setMyPhoto(dataUri); await refresh(); }
    catch (e: any) { Alert.alert("Couldn't update photo", e?.message || "Please try a smaller image."); }
    setUploadingPhoto(false);
  };
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isMember, setIsMember] = useState(false);
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
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [adminUnread, setAdminUnread] = useState(0);
  useFocusEffect(useCallback(() => {
    if (user?.is_admin) {
      api.adminThreads()
        .then((r) => setAdminUnread((r.threads || []).reduce((s: number, t: any) => s + (t.unread || 0), 0)))
        .catch(() => {});
    }
  }, [user?.is_admin]));

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

  const infoLinks = [
    { key: "services", icon: "barbell", label: "Our Services", onPress: () => router.push("/services") },
    { key: "about", icon: "people", label: "About Us & Team", onPress: () => router.push("/about") },
    { key: "contact", icon: "call", label: "Contact & Gym Info", onPress: () => router.push("/contact") },
    { key: "privacy", icon: "shield-checkmark", label: "Privacy Policy", onPress: () => router.push("/privacy") },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Pressable style={styles.avatarWrap} onPress={pickPhoto} testID="profile-avatar">
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEdit}>
              {uploadingPhoto ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="camera" size={14} color={colors.onBrand} />}
            </View>
          </Pressable>
          <Text style={styles.name}>{user?.name || "Member"}</Text>
          {!!user?.handle && <Text style={styles.handleText}>ID: {user.handle}</Text>}
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

          {!!user?.credit_cents && user.credit_cents > 0 && (
            <Pressable style={styles.creditBanner} testID="profile-credit" onPress={() => router.push("/credits")}>
              <Ionicons name="wallet" size={18} color={colors.brand} />
              <Text style={styles.creditBannerText}>
                ${(user.credit_cents / 100).toFixed(2)} account credit — use it when you book a class
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </Pressable>
          )}
        </View>

        {user?.is_admin && (
          <>
            <Text style={styles.section}>ADMIN</Text>
            <View style={styles.linkGroup}>
              <Pressable testID="open-admin-dashboard" style={[styles.membershipRow, styles.linkRowDivider]} onPress={() => router.push("/admin")}>
                <View style={styles.membershipIcon}>
                  <Ionicons name="construct" size={20} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.membershipLabel}>Admin Dashboard</Text>
                  <Text style={styles.membershipSub}>Classes, notices, attendance & more</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
              <Pressable testID="open-admin-applications" style={[styles.membershipRow, styles.linkRowDivider]} onPress={() => router.push("/admin/applications")}>
                <View style={styles.membershipIcon}>
                  <Ionicons name="document-text" size={20} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.membershipLabel}>Membership Applications</Text>
                  <Text style={styles.membershipSub}>Review & keep a record of sign-ups</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
              <Pressable testID="open-admin-inbox" style={styles.membershipRow} onPress={() => router.push("/admin/inbox")}>
                <View style={styles.membershipIcon}>
                  <Ionicons name="chatbubbles" size={20} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.membershipLabel}>Customer Support</Text>
                  <Text style={styles.membershipSub}>Read & reply to member messages</Text>
                </View>
                {adminUnread > 0 && (
                  <View style={styles.navBadge}><Text style={styles.navBadgeText}>{adminUnread}</Text></View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.section}>ACTIVITY</Text>
        <View style={styles.linkGroup}>
          <Pressable testID="profile-link-bookings" style={[styles.membershipRow, styles.linkRowDivider]} onPress={() => router.push("/bookings")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="calendar" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>My Bookings</Text>
              <Text style={styles.membershipSub}>Manage classes, reschedule & receipts</Text>
            </View>
            {bookings.length > 0 && (
              <View style={styles.navBadge}><Text style={styles.navBadgeText}>{bookings.length}</Text></View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
          <Pressable testID="profile-link-notifications" style={[styles.membershipRow, styles.linkRowDivider]} onPress={() => router.push("/notifications")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="notifications" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>Notifications</Text>
              <Text style={styles.membershipSub}>Your alerts & notification history</Text>
            </View>
            {unread > 0 && (
              <View style={styles.navBadge}><Text style={styles.navBadgeText}>{unread}</Text></View>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
          <Pressable testID="profile-link-credits" style={styles.membershipRow} onPress={() => router.push("/credits")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="wallet" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>My Credit</Text>
              <Text style={styles.membershipSub}>Credit earned & spent on bookings</Text>
            </View>
            <View style={styles.navBadge}><Text style={styles.navBadgeText}>${((user?.credit_cents || 0) / 100).toFixed(0)}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        </View>

        <Text style={styles.section}>MEMBERSHIP</Text>
        <View style={styles.linkGroup}>
          <Pressable testID="profile-link-membership" style={[styles.membershipRow, styles.linkRowDivider]} onPress={() => router.push("/vigyr-signon")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="card" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>Membership Application</Text>
              <Text style={styles.membershipSub}>Join or manage your membership</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
          <Pressable testID="profile-link-freetrial" style={styles.membershipRow} onPress={() => router.push("/free-trial")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="gift" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>Free Trial</Text>
              <Text style={styles.membershipSub}>Claim your free class & show your QR at the gym</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        </View>

        <Text style={styles.section}>PAYMENTS</Text>
        <View style={styles.linkGroup}>
          <Pressable testID="profile-link-receipts" style={styles.membershipRow} onPress={() => router.push("/receipts")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="receipt" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>Receipts</Text>
              <Text style={styles.membershipSub}>View & share receipts for paid bookings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        </View>

        <Text style={styles.section}>SETTINGS</Text>
        <View style={styles.linkGroup}>
          <Pressable testID="profile-link-settings" style={styles.membershipRow} onPress={() => router.push("/inbox-settings")}>
            <View style={styles.membershipIcon}>
              <Ionicons name="options" size={20} color={colors.onBrand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.membershipLabel}>Settings</Text>
              <Text style={styles.membershipSub}>Message alerts, class reminders & quiet hours</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        </View>

        <Text style={styles.section}>GYM INFO</Text>
        <View style={styles.linkGroup}>
          {infoLinks.map((l, i) => (
            <Pressable
              key={l.key}
              testID={`profile-link-${l.key}`}
              style={[styles.linkRow, i < infoLinks.length - 1 && styles.linkRowDivider]}
              onPress={l.onPress}
            >
              <View style={styles.linkIcon}>
                <Ionicons name={l.icon as any} size={18} color={colors.brand} />
              </View>
              <Text style={styles.linkLabel}>{l.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          ))}
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
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarWrap: { width: 88, height: 88, marginBottom: spacing.md },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: colors.brand },
  avatarEdit: { position: "absolute", right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surface },
  avatarText: { color: colors.onBrand, fontSize: 34, fontWeight: "900" },
  handleText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  name: { ...type.h2 },
  email: { ...type.bodyDim, marginTop: 2 },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  adminBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  badgeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap", justifyContent: "center" },
  memberBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#16A34A", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  memberBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  statsRow: { flexDirection: "row", marginTop: spacing.xl, gap: spacing.md, alignSelf: "stretch" },
  creditBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md },
  creditBannerText: { color: colors.brand, fontSize: 13, fontWeight: "800", flex: 1 },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  linkGroup: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  linkRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  membershipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  membershipIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  membershipLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15 },
  membershipSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  navBadge: { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  navBadgeText: { color: colors.onBrand, fontSize: 12, fontWeight: "900" },
  linkIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  linkLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15, flex: 1 },
  downloadRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand },
  downloadIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  downloadLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15 },
  downloadSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  section: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  reminderCard: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  reminderLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  reminderChips: { flexDirection: "row", gap: spacing.sm },
  reminderChip: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  reminderChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  reminderChipText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  reminderChipTextActive: { color: colors.brand },
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
  qrInfoBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qrInfoText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "600" },
  receiptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  receiptBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
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
