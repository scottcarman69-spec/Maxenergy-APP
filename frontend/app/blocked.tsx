import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Image } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Blocked = { user_id: string; name: string; handle?: string; avatar_url?: string };

export default function BlockedMembers() {
  const [list, setList] = useState<Blocked[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.friendsBlocked();
      setList(r.blocked || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unblock = async (uid: string) => {
    setBusy(uid);
    try {
      await api.friendUnblock(uid);
      setList((l) => l.filter((x) => x.user_id !== uid));
    } catch {}
    setBusy(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Blocked Members" backTestID="blocked-back" fallback="/inbox-settings" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <Text style={styles.hint}>Blocked members can't message you or see your activity. Unblock anyone to reconnect.</Text>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>You haven't blocked anyone.</Text>
            </View>
          ) : (
            list.map((m) => (
              <View key={m.user_id} style={styles.row}>
                {m.avatar_url ? (
                  <Image source={{ uri: m.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{(m.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{m.name}</Text>
                  {!!m.handle && <Text style={styles.handle} numberOfLines={1}>@{m.handle}</Text>}
                </View>
                <Pressable
                  testID={`unblock-${m.user_id}`}
                  style={[styles.unblockBtn, busy === m.user_id && { opacity: 0.6 }]}
                  onPress={() => unblock(m.user_id)}
                  disabled={busy === m.user_id}
                >
                  {busy === m.user_id ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={styles.unblockText}>Unblock</Text>}
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hint: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: "center", padding: spacing.xl, gap: 8 },
  emptyText: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.onSurface, fontFamily: font.heading, fontSize: 18 },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  handle: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  unblockBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.brand },
  unblockText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
});
