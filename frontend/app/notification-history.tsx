import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { stampTime, stampDate } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";
import ScreenHeader from "@/src/components/ScreenHeader";

type Notif = {
  notification_id: string;
  title: string;
  body: string;
  read: boolean;
  cleared?: boolean;
  created_at: string;
  type: string;
};

const ICONS: Record<string, any> = {
  message: "chatbubble-ellipses",
  booking: "calendar",
  application: "document-text",
  trial: "gift",
  system: "megaphone",
};

function fmtWhen(iso?: string) {
  if (!iso) return "";
  return stampDate(iso, { day: "2-digit", month: "short", year: "numeric" }) + " · " + stampTime(iso);
}

export default function NotificationHistory() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.notificationsHistory();
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <ScreenHeader title="Notification Log" subtitle="Your full saved history" backTestID="history-back" fallback="/(tabs)/alerts" />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {notifs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No history yet. Every booking update, message and gym alert you receive is saved here permanently.</Text>
            </View>
          ) : (
            notifs.map((n) => (
              <View key={n.notification_id} testID={`history-${n.notification_id}`} style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name={ICONS[n.type] || "notifications"} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                    {n.cleared && (
                      <View style={styles.clearedTag}>
                        <Text style={styles.clearedTagText}>CLEARED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.when}>{fmtWhen(n.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  title: { color: colors.onSurface, fontWeight: "800", fontSize: 15, flex: 1 },
  clearedTag: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  clearedTagText: { color: colors.onSurfaceSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  body: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 3, lineHeight: 18 },
  when: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 6, opacity: 0.8 },
});
