import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Thread = {
  user_id: string;
  name: string;
  email?: string;
  last_body: string;
  last_at: string;
  last_is_admin: boolean;
  unread: number;
};

function fmtWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const opt = { timeZone: "Australia/Brisbane" } as const;
  const qldDay = (x: Date) => x.toLocaleDateString("en-CA", opt);
  const sameDay = qldDay(d) === qldDay(new Date());
  return sameDay
    ? d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", ...opt })
    : d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", ...opt });
}

export default function AdminInbox() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.adminThreads();
      setThreads(r.threads || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="inbox-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Inbox</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}>
          {threads.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No conversations yet. Member messages will appear here.</Text>
            </View>
          ) : (
            threads.map((t) => (
              <Pressable
                key={t.user_id}
                testID={`inbox-thread-${t.user_id}`}
                style={styles.card}
                onPress={() => router.push({ pathname: "/admin/thread", params: { userId: t.user_id, name: t.name } } as any)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(t.name || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.topRow}>
                    <Text style={styles.name} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.when}>{fmtWhen(t.last_at)}</Text>
                  </View>
                  <Text style={[styles.preview, t.unread > 0 && styles.previewUnread]} numberOfLines={1}>
                    {t.last_is_admin ? "You: " : ""}{t.last_body}
                  </Text>
                </View>
                {t.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{t.unread}</Text>
                  </View>
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrand, fontSize: 18, fontWeight: "900" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { color: colors.onSurface, fontWeight: "800", fontSize: 15, flex: 1 },
  when: { color: colors.onSurfaceSecondary, fontSize: 11 },
  preview: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 3 },
  previewUnread: { color: colors.onSurface, fontWeight: "700" },
  unreadBadge: { backgroundColor: colors.brand, minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: colors.onBrand, fontWeight: "900", fontSize: 11 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
});
