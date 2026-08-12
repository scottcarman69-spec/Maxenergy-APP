import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";
import { presenceLabel, isOnline } from "@/src/presence";
import { groupLogo } from "@/src/groups";

type Thread = { user_id: string; name?: string; handle?: string; picture?: string; last_body?: string; last_at?: string; unread?: number; last_active_at?: string };
type Group = { group_id: string; name: string; members: number; slug?: string; is_official?: boolean; last_body?: string; last_sender?: string; unread?: number };
type Discover = { group_id: string; name: string; slug?: string; members: number; description?: string; is_member: boolean; join_status: "none" | "pending" | "member" };

function Avatar({ uri, name, size = 46 }: { uri?: string; name?: string; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  const initials = (name || "?").trim().split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand }}>
      <Text style={{ color: colors.brand, fontWeight: "900", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export default function InboxTab() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [discover, setDiscover] = useState<Discover[]>([]);
  const [joining, setJoining] = useState<string | null>(null);
  const [gymUnread, setGymUnread] = useState(0);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, g, f, gr, dc] = await Promise.all([api.dmThreads(), api.myMessages(), api.friends(), api.groups(), api.groupsDiscover()]);
      setThreads(t.threads || []);
      const gm = (g.messages || []).filter((m: any) => m.sender_is_admin && !m.read_by_member);
      setGymUnread(gm.length);
      setPending((f.incoming || []).length);
      setGroups(gr.groups || []);
      setDiscover((dc.groups || []).filter((d: Discover) => !d.is_member));
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const requestJoin = async (d: Discover) => {
    setJoining(d.group_id);
    try { await api.groupJoin(d.group_id); await load(); } catch {}
    setJoining(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSub}>Chat with the gym & your friends</Text>
        </View>
        <Pressable testID="inbox-add-friends" style={styles.addBtn} onPress={() => router.push("/friends")}>
          <Ionicons name="person-add" size={16} color={colors.onBrand} />
          <Text style={styles.addBtnText}>Add</Text>
          {pending > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{pending}</Text></View>}
        </Pressable>
        <Pressable testID="inbox-new-group" style={styles.groupBtn} onPress={() => router.push("/group/new")}>
          <Ionicons name="people" size={18} color={colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
          {/* Gym conversation */}
          <Pressable testID="inbox-gym" style={styles.row} onPress={() => router.push("/chat/gym")}>
            <View style={styles.gymIcon}><Ionicons name="barbell" size={22} color={colors.onBrand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>Maxenergy Team</Text>
              <Text style={styles.rowSub} numberOfLines={1}>Questions, bookings & support</Text>
            </View>
            {gymUnread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{gymUnread}</Text></View>}
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>

          {pending > 0 && (
            <Pressable testID="inbox-requests" style={styles.requestRow} onPress={() => router.push("/friends")}>
              <Ionicons name="person-add" size={18} color={colors.brand} />
              <Text style={styles.requestText}>You have {pending} friend request{pending > 1 ? "s" : ""}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brand} />
            </Pressable>
          )}

          {groups.length > 0 && <Text style={styles.section}>GROUPS</Text>}
          {groups.map((g) => {
            const logo = groupLogo(g.slug);
            return (
            <Pressable key={g.group_id} testID={`inbox-group-${g.group_id}`} style={styles.row} onPress={() => router.push({ pathname: "/group/[id]", params: { id: g.group_id, name: g.name } } as any)}>
              {logo ? (
                <Image source={logo} style={styles.groupLogo} resizeMode="contain" />
              ) : (
                <View style={styles.gymIcon}><Ionicons name="people" size={22} color={colors.onBrand} /></View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.rowName} numberOfLines={1}>{g.name}</Text>
                  {g.is_official && <View style={styles.officialTag}><Ionicons name="shield-checkmark" size={10} color={colors.brand} /><Text style={styles.officialTagText}>OFFICIAL</Text></View>}
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>{g.last_body ? `${g.last_sender ? g.last_sender.split(" ")[0] + ": " : ""}${g.last_body}` : `${g.members} members`}</Text>
              </View>
              {(g.unread || 0) > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{g.unread}</Text></View>}
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
            );
          })}

          {discover.length > 0 && <Text style={styles.section}>JOIN A GROUP</Text>}
          {discover.map((d) => {
            const logo = groupLogo(d.slug);
            const isPending = d.join_status === "pending";
            return (
              <View key={d.group_id} testID={`inbox-discover-${d.group_id}`} style={styles.row}>
                {logo ? (
                  <Image source={logo} style={styles.groupLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.gymIcon}><Ionicons name="people" size={22} color={colors.onBrand} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={2}>{d.description || `${d.members} members`}</Text>
                </View>
                {isPending ? (
                  <View style={styles.pendingPill}><Text style={styles.pendingText}>Requested</Text></View>
                ) : (
                  <Pressable testID={`inbox-join-${d.group_id}`} style={styles.joinBtn} onPress={() => requestJoin(d)} disabled={joining === d.group_id}>
                    {joining === d.group_id ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Text style={styles.joinText}>Join</Text>}
                  </Pressable>
                )}
              </View>
            );
          })}

          {threads.length > 0 && <Text style={styles.section}>FRIENDS</Text>}
          {threads.map((t) => (
            <Pressable key={t.user_id} testID={`inbox-friend-${t.user_id}`} style={styles.row} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: t.user_id, name: t.name || "Friend" } } as any)}>
              <View>
                <Avatar uri={t.picture} name={t.name} />
                {isOnline(t.last_active_at) && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{t.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{t.last_body || presenceLabel(t.last_active_at) || "Say hi 👋"}</Text>
              </View>
              {(t.unread || 0) > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{t.unread}</Text></View>}
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
            </Pressable>
          ))}

          {threads.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={38} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>Add gym friends to start chatting. Tap “Add” to search by name or account ID.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", letterSpacing: 0.3 },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radius.pill },
  addBtnText: { color: colors.onBrand, fontWeight: "900", fontSize: 13 },
  groupBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.brand, alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: "#22C55E", borderWidth: 2, borderColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: spacing.md, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  gymIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  groupLogo: { width: 58, height: 58, marginLeft: -4, marginVertical: -6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  officialTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  officialTagText: { color: colors.brand, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.5 },
  joinBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8, minWidth: 62, alignItems: "center" },
  joinText: { color: colors.onBrand, fontWeight: "900", fontSize: 13 },
  pendingPill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  pendingText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 12 },
  rowName: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  rowSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  requestText: { flex: 1, color: colors.brand, fontWeight: "800", fontSize: 13.5 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.onBrand, fontWeight: "900", fontSize: 11 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
});
