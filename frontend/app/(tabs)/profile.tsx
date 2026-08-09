import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

type Notif = { notification_id: string; title: string; body: string; read: boolean; created_at: string; type: string };
type Booking = { booking_id: string; class_name: string; status: string; amount: number };

export default function Profile() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [n, b] = await Promise.all([api.notifications(), api.myBookings()]);
      setNotifs(n.notifications || []);
      setBookings(b.bookings || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const paidCount = bookings.filter((b) => b.status === "paid").length;
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name || "Member"}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{paidCount}</Text>
              <Text style={styles.statLabel}>Booked</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{bookings.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{unread}</Text>
              <Text style={styles.statLabel}>Unread</Text>
            </View>
          </View>
        </View>

        <Text style={styles.section}>NOTIFICATIONS</Text>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
        ) : notifs.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={28} color={colors.onSurfaceSecondary} />
            <Text style={styles.emptyText}>You're all caught up.</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {notifs.slice(0, 8).map((n) => (
              <Pressable
                key={n.notification_id}
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
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.section}>MY BOOKINGS</Text>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {bookings.length === 0 ? (
            <Text style={styles.emptyInline}>No bookings yet. Head to the Timetable to book a class.</Text>
          ) : (
            bookings.map((b) => (
              <View key={b.booking_id} style={styles.bookingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifTitle}>{b.class_name}</Text>
                  <Text style={styles.notifBody}>${(b.amount / 100).toFixed(0)} · {b.status.toUpperCase()}</Text>
                </View>
                <View style={[styles.statusPill, b.status === "paid" ? styles.paid : styles.pending]}>
                  <Text style={[styles.statusText, b.status === "paid" ? { color: colors.onBrand } : { color: colors.onSurface }]}>
                    {b.status === "paid" ? "PAID" : b.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable testID="logout-button" style={styles.logout} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: "center", padding: spacing.xl, gap: spacing.xs },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.onBrand, fontSize: 34, fontWeight: "900" },
  name: { ...type.h2 },
  email: { ...type.bodyDim, marginTop: 2 },
  statsRow: {
    flexDirection: "row",
    marginTop: spacing.xl,
    gap: spacing.md,
    alignSelf: "stretch",
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statNum: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  section: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  notifTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  notifBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  emptyInline: { color: colors.onSurfaceSecondary, fontSize: 13, paddingVertical: spacing.md },
  bookingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  paid: { backgroundColor: colors.brand },
  pending: { backgroundColor: colors.surfaceTertiary },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  logout: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  logoutText: { color: colors.error, fontWeight: "800", letterSpacing: 0.5 },
});
