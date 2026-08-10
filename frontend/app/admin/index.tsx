import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius } from "@/src/theme";

export default function AdminHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStats(await api.adminOverview());
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.denied}>
          <Ionicons name="lock-closed" size={40} color={colors.onSurfaceSecondary} />
          <Text style={styles.deniedText}>Admin access required.</Text>
          <Pressable testID="admin-back-denied" onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cards = [
    { key: "classes", icon: "calendar", label: "Manage Classes", desc: "Add, edit, rename & remove classes", route: "/admin/classes", count: stats?.classes },
    { key: "bookings", icon: "clipboard", label: "Bookings", desc: "Accept, reschedule or cancel bookings", route: "/admin/bookings", count: stats?.pending_bookings, badge: true },
    { key: "calendar", icon: "calendar-number", label: "Bookings Calendar", desc: "See all bookings by day & their status", route: "/admin/calendar" },
    { key: "members", icon: "people", label: "Members & Trials", desc: "Browse members and free trial claims", route: "/admin/members", count: stats?.members },
    { key: "inbox", icon: "chatbubbles", label: "Inbox", desc: "Read & reply to member messages", route: "/admin/inbox", count: stats?.unread_messages, badge: true },
    { key: "scan", icon: "qr-code", label: "Scan Check-In", desc: "Scan a member's QR to check them in", route: "/admin/scan" },
    { key: "attendance", icon: "stats-chart", label: "Attendance Report", desc: "Check-ins by day, week & month", route: "/admin/attendance" },
    { key: "announcements", icon: "megaphone", label: "Gym Notices", desc: "Post & edit announcements to members", route: "/admin/announcements", count: stats?.announcements },
    { key: "applications", icon: "document-text", label: "Applications", desc: "Review membership applications", route: "/admin/applications", count: stats?.pending_applications, badge: true },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="admin-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats?.members ?? 0}</Text>
              <Text style={styles.statLabel}>MEMBERS</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats?.classes ?? 0}</Text>
              <Text style={styles.statLabel}>CLASSES</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{stats?.pending_applications ?? 0}</Text>
              <Text style={styles.statLabel}>PENDING</Text>
            </View>
          </View>

          {cards.map((c) => (
            <Pressable key={c.key} testID={`admin-nav-${c.key}`} style={styles.card} onPress={() => router.push(c.route as any)}>
              <View style={styles.cardIcon}>
                <Ionicons name={c.icon as any} size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardLabel}>{c.label}</Text>
                <Text style={styles.cardDesc}>{c.desc}</Text>
              </View>
              {c.badge && !!c.count && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{c.count}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: spacing.md },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 24, fontWeight: "900" },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardIcon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  cardLabel: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  cardDesc: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  countBadge: { backgroundColor: colors.brand, minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  countText: { color: colors.onBrand, fontWeight: "900", fontSize: 12 },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  deniedText: { color: colors.onSurfaceSecondary },
  backBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.md },
  backText: { color: colors.onBrand, fontWeight: "800" },
});
