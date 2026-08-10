import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string; data?: { nav?: string; user_id?: string; name?: string } };

function fmtWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
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
          router.push("/(tabs)/inbox");
        }
        break;
      case "member_inbox":
        router.push("/(tabs)/inbox");
        break;
      case "member_bookings":
        router.push("/(tabs)/profile");
        break;
      case "member_membership":
        router.push("/membership");
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

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSub}>{unread > 0 ? `${unread} unread` : "You're all caught up"}</Text>
        </View>
        {unread > 0 && (
          <Pressable testID="notif-mark-all" style={styles.markAllBtn} onPress={markAll}>
            <Ionicons name="checkmark-done" size={16} color={colors.brand} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No notifications yet. Booking updates, messages and gym alerts will appear here.</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  markAllText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
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
});
