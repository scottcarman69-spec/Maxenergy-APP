import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, font } from "@/src/theme";
import { stampTime, stampDate, isQldToday } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string; data?: { nav?: string; user_id?: string; name?: string; class_id?: string } };

function fmtWhen(iso?: string) {
  if (!iso) return "";
  return isQldToday(iso)
    ? stampTime(iso)
    : stampDate(iso, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
}

const ICONS: Record<string, any> = {
  message: "chatbubble-ellipses",
  booking: "calendar",
  application: "document-text",
  trial: "gift",
  system: "megaphone",
};

export default function AlertsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.notifications();
      setNotifs(r.notifications || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const markOne = (id: string) => {
    setNotifs((cur) => cur.map((x) => (x.notification_id === id ? { ...x, read: true } : x)));
    api.markRead(id).catch(() => {});
  };
  const openNotif = (n: Notif) => {
    if (!n.read) markOne(n.notification_id);
    const nav = n.data?.nav;
    switch (nav) {
      case "admin_thread":
        if (user?.is_admin && n.data?.user_id) {
          router.push({ pathname: "/admin/thread", params: { userId: n.data.user_id, name: n.data?.name || "Member" } } as any);
        } else {
          router.navigate("/(tabs)/inbox");
        }
        break;
      case "member_inbox":
        router.navigate("/(tabs)/inbox");
        break;
      case "member_bookings":
        router.push("/bookings" as any);
        break;
      case "member_membership":
        router.push("/vigyr-signon");
        break;
      case "member_store":
        router.push("/memberships");
        break;
      case "class_detail":
        if (n.data?.class_id) router.push({ pathname: "/class/[id]", params: { id: n.data.class_id } } as any);
        else router.navigate("/(tabs)/home");
        break;
      case "admin_bookings":
        router.push("/admin/bookings" as any);
        break;
      case "admin_applications":
        router.push("/admin/applications" as any);
        break;
      case "admin_members":
        router.push("/admin/members" as any);
        break;
      case "admin_group_requests":
        router.push("/admin/group-requests" as any);
        break;
      default:
        break;
    }
  };
  const deleteNotif = (id: string) => {
    setNotifs((cur) => cur.filter((x) => x.notification_id !== id));
    api.deleteNotification(id).catch(() => {});
  };
  const markAll = () => {
    setNotifs((cur) => cur.map((x) => ({ ...x, read: true })));
    api.markAllNotificationsRead().catch(() => {});
  };
  const clearAll = () => setConfirmClear(true);
  const doClearAll = () => {
    setNotifs([]);
    api.clearAllNotifications().catch(() => {});
    setConfirmClear(false);
  };

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1} allowFontScaling={false}>Notifications</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{unread > 0 ? `${unread} unread` : "You're all caught up"}</Text>
        </View>
        <View style={styles.headerActions}>
          {unread > 0 && (
            <Pressable testID="notif-mark-all" style={styles.markAllBtn} onPress={markAll}>
              <Ionicons name="checkmark-done" size={15} color={colors.brand} />
              <Text style={styles.markAllText} allowFontScaling={false}>Read all</Text>
            </Pressable>
          )}
          {notifs.length > 0 && (
            <Pressable testID="notif-clear-all" style={styles.clearAllBtn} onPress={clearAll}>
              <Ionicons name="trash-outline" size={15} color={colors.error} />
              <Text style={styles.clearAllText} allowFontScaling={false}>Clear</Text>
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} colors={[colors.brand]} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifs.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={30} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyText}>Booking updates, messages and gym alerts will appear here as soon as there's news.</Text>
              <Pressable
                testID="alerts-browse-classes"
                onPress={() => router.navigate("/(tabs)/timetable")}
                style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.9 }]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.onBrand} />
                <Text style={styles.emptyBtnText}>Browse classes</Text>
              </Pressable>
            </View>
          ) : (
            notifs.map((n) => (
              <Swipeable
                key={n.notification_id}
                renderRightActions={() => (
                  <Pressable testID={`notif-delete-${n.notification_id}`} style={styles.delete} onPress={() => deleteNotif(n.notification_id)}>
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={styles.deleteText}>Clear</Text>
                  </Pressable>
                )}
                onSwipeableOpen={(dir) => { if (dir === "right") deleteNotif(n.notification_id); }}
                overshootRight={false}
                rightThreshold={40}
              >
                <Pressable
                  testID={`notif-${n.notification_id}`}
                  style={[styles.row, !n.read && styles.rowUnread]}
                  onPress={() => openNotif(n)}
                >
                  <View style={[styles.iconWrap, !n.read && { backgroundColor: colors.brand }]}>
                    <Ionicons name={ICONS[n.type] || "notifications"} size={18} color={!n.read ? colors.onBrand : colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                      <Text style={styles.when}>{fmtWhen(n.created_at)}</Text>
                    </View>
                    <Text style={styles.body} numberOfLines={2}>{n.body}</Text>
                    {!!n.data?.nav && <Text style={styles.tapHint}>{n.type === "message" ? "Tap to open conversation ›" : "Tap to view details ›"}</Text>}
                  </View>
                  {!n.read && <View style={styles.dot} />}
                </Pressable>
              </Swipeable>
            ))
          )}
          {notifs.length > 0 && <Text style={styles.hint}>Swipe a notification left to clear it</Text>}
        </ScrollView>
      )}

      <Modal visible={confirmClear} transparent animationType="fade" onRequestClose={() => setConfirmClear(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Clear all notifications?</Text>
            <Text style={styles.modalBody}>This removes every notification from your list. You can still find them in your saved history.</Text>
            <View style={styles.modalActions}>
              <Pressable testID="notif-clear-cancel" style={[styles.modalBtn, styles.modalCancel]} onPress={() => setConfirmClear(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable testID="notif-clear-confirm" style={[styles.modalBtn, styles.modalConfirm]} onPress={doClearAll}>
                <Text style={styles.modalConfirmText}>Clear all</Text>
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitleWrap: { flexShrink: 1, minWidth: 0 },
  headerTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  markAllText: { color: colors.brand, fontWeight: "800", fontSize: 11 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 0 },
  clearAllBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  clearAllText: { color: colors.error, fontWeight: "800", fontSize: 11 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyCard: { marginTop: spacing.xl, padding: spacing.xxl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: spacing.sm },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13.5, textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: spacing.md, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 11, borderRadius: radius.pill },
  emptyBtnText: { color: colors.onBrand, fontSize: 14, fontFamily: font.heading },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowUnread: { borderColor: colors.brand },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: colors.onSurface, fontWeight: "800", fontSize: 15, flex: 1 },
  when: { color: colors.onSurfaceSecondary, fontSize: 11 },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 },
  tapHint: { color: colors.brand, fontSize: 11, fontWeight: "800", marginTop: 5 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand },
  delete: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, borderRadius: radius.md, marginLeft: spacing.sm, gap: 2 },
  deleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  hint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: 6, opacity: 0.7 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading, marginBottom: spacing.sm },
  modalBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },
  modalActions: { flexDirection: "row", gap: spacing.sm },
  modalBtn: { flex: 1, paddingVertical: 13, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  modalCancel: { borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  modalConfirm: { backgroundColor: colors.error },
  modalConfirmText: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
