import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius } from "@/src/theme";
import { presenceLabel, isOnline } from "@/src/presence";
import ScreenHeader from "@/src/components/ScreenHeader";

type M = { user_id: string; name?: string; handle?: string; picture?: string; last_active_at?: string };

export default function GroupMembers() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = String(id);
  const [name, setName] = useState("Group");
  const [ownerId, setOwnerId] = useState("");
  const [members, setMembers] = useState<M[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const g = await api.groupGet(gid);
      setName(g.group?.name || "Group");
      setOwnerId(g.group?.owner_id || "");
      setMembers(g.group?.members || []);
    } catch {}
    setLoading(false);
  }, [gid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const initial = (m: M) => (m.name || "?").slice(0, 1).toUpperCase();

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Members" subtitle={`${members.length} in ${name}`} fallback="/(tabs)/inbox" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 60 }}>
          {members.map((m) => {
            const online = isOnline(m.last_active_at);
            return (
              <View key={m.user_id} style={styles.row} testID={`gmember-${m.user_id}`}>
                <View style={styles.avatarWrap}>
                  {m.picture ? (
                    <Image source={{ uri: m.picture }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatar}><Text style={styles.avatarText}>{initial(m)}</Text></View>
                  )}
                  {online && <View style={styles.dot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {m.name}{m.user_id === ownerId ? "  ·  Owner" : ""}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {m.handle ? `${m.handle} · ` : ""}{online ? "Active now" : presenceLabel(m.last_active_at)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

import { api } from "@/src/api";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  avatarWrap: { width: 46, height: 46 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  avatarText: { color: colors.onBrand, fontSize: 18, fontWeight: "900" },
  dot: { position: "absolute", right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: colors.surfaceSecondary },
  name: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
});
