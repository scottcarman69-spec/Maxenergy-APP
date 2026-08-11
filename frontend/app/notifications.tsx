import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string };

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [reminderHours, setReminderHours] = useState<number>(3);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [n, m] = await Promise.all([api.notifications(), api.me()]);
      setNotifs(n.notifications || []);
      setReminderHours(m?.user?.reminder_hours ?? 3);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changeReminder = async (h: number) => {
    const prev = reminderHours;
    setReminderHours(h);
    try {
      await api.setReminderPreference(h);
      setBanner(h === 0 ? "Class reminders turned off." : `Reminder set to ${h === 1 ? "1 hour" : h + " hours"} before class.`);
    } catch (e: any) {
      setReminderHours(prev);
      setBanner(e?.message || "Could not update reminder preference.");
    }
  };

  const deleteNotif = (id: string) => {
    setNotifs((cur) => cur.filter((x) => x.notification_id !== id));
    api.deleteNotification(id).catch(() => {});
  };

  const clearAllNotifs = async () => {
    setNotifs([]);
    setBanner("Notifications cleared. You can still view them in your log.");
    try { await api.clearAllNotifications(); } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Notifications" backTestID="notifications-back" fallback="/(tabs)/alerts" />

      {banner && (
        <Pressable testID="notifications-banner" style={styles.banner} onPress={() => setBanner(null)}>
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.section}>CLASS REMINDERS</Text>
        <View style={styles.reminderCard}>
          <Text style={styles.reminderLabel}>Remind me before a booked class</Text>
          <View style={styles.reminderChips}>
            {[0, 1, 3, 12].map((h) => {
              const active = reminderHours === h;
              return (
                <Pressable
                  key={h}
                  testID={`reminder-${h}h`}
                  style={[styles.reminderChip, active && styles.reminderChipActive]}
                  onPress={() => changeReminder(h)}
                >
                  <Text style={[styles.reminderChipText, active && styles.reminderChipTextActive]}>
                    {h === 0 ? "Off" : h === 1 ? "1 hr" : `${h} hrs`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0, paddingHorizontal: 0 }]}>RECENT</Text>
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
            {notifs.map((n) => (
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
                onSwipeableOpen={(direction) => { if (direction === "right") deleteNotif(n.notification_id); }}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  banner: { backgroundColor: colors.brandTertiary, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700" },
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
});
