import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Image, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type M = { user_id: string; name?: string; handle?: string; picture?: string; friend_status?: string; friendship_key?: string };

function Avatar({ uri, name }: { uri?: string; name?: string }) {
  if (uri) return <Image source={{ uri }} style={styles.avatar} />;
  const initials = (name || "?").trim().split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarText}>{initials}</Text></View>;
}

export default function Friends() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<M[]>([]);
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState<M[]>([]);
  const [outgoing, setOutgoing] = useState<M[]>([]);
  const [friends, setFriends] = useState<M[]>([]);
  const [myHandle, setMyHandle] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadFriends = useCallback(async () => {
    try {
      const [f, me] = await Promise.all([api.friends(), api.me()]);
      setIncoming(f.incoming || []); setOutgoing(f.outgoing || []); setFriends(f.friends || []);
      setMyHandle(me?.user?.handle || "");
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { loadFriends(); }, [loadFriends]));
  const onRefresh = async () => { setRefreshing(true); await loadFriends(); setRefreshing(false); };

  const doSearch = async (text: string) => {
    setQ(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try { const r = await api.searchMembers(text.trim()); setResults(r.results || []); } catch {}
    setSearching(false);
  };

  const request = async (m: M) => {
    setResults((rs) => rs.map((x) => x.user_id === m.user_id ? { ...x, friend_status: "pending_out" } : x));
    try { await api.friendRequest({ user_id: m.user_id }); await loadFriends(); } catch { await loadFriends(); }
  };
  const respond = async (m: M, accept: boolean) => {
    try { await api.friendRespond(m.user_id, accept); await loadFriends(); } catch {}
  };

  const statusBtn = (m: M) => {
    if (m.friend_status === "friends") return <Text style={styles.tag}>Friends</Text>;
    if (m.friend_status === "pending_out") return <Text style={styles.tag}>Requested</Text>;
    if (m.friend_status === "pending_in") return <Pressable style={styles.addBtn} onPress={() => respond(m, true)}><Text style={styles.addBtnText}>Accept</Text></Pressable>;
    return <Pressable testID={`add-${m.user_id}`} style={styles.addBtn} onPress={() => request(m)}><Ionicons name="person-add" size={14} color={colors.onBrand} /><Text style={styles.addBtnText}>Add</Text></Pressable>;
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Add Friends" fallback="/(tabs)/inbox" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
        {!!myHandle && (
          <View style={styles.idCard}>
            <Ionicons name="id-card-outline" size={18} color={colors.brand} />
            <Text style={styles.idText}>Your account ID: <Text style={{ fontWeight: "900", color: colors.brand }}>{myHandle}</Text></Text>
          </View>
        )}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
          <TextInput testID="friend-search" value={q} onChangeText={doSearch} placeholder="Search by name or account ID" placeholderTextColor={colors.onSurfaceSecondary} style={styles.searchInput} autoCapitalize="none" />
          {searching && <ActivityIndicator size="small" color={colors.brand} />}
        </View>

        {results.map((m) => (
          <View key={m.user_id} style={styles.row}>
            <Avatar uri={m.picture} name={m.name} />
            <View style={{ flex: 1 }}><Text style={styles.name}>{m.name}</Text><Text style={styles.handle}>{m.handle}</Text></View>
            {statusBtn(m)}
          </View>
        ))}
        {q.trim().length >= 2 && results.length === 0 && !searching && (
          <Text style={styles.hint}>No members found for “{q}”.</Text>
        )}

        {incoming.length > 0 && <Text style={styles.section}>REQUESTS</Text>}
        {incoming.map((m) => (
          <View key={m.user_id} style={styles.row}>
            <Avatar uri={m.picture} name={m.name} />
            <View style={{ flex: 1 }}><Text style={styles.name}>{m.name}</Text><Text style={styles.handle}>{m.handle}</Text></View>
            <Pressable testID={`accept-${m.user_id}`} style={styles.addBtn} onPress={() => respond(m, true)}><Text style={styles.addBtnText}>Accept</Text></Pressable>
            <Pressable style={styles.declineBtn} onPress={() => respond(m, false)}><Ionicons name="close" size={16} color={colors.error} /></Pressable>
          </View>
        ))}

        {friends.length > 0 && <Text style={styles.section}>YOUR FRIENDS</Text>}
        {friends.map((m) => (
          <Pressable key={m.user_id} style={styles.row} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: m.user_id, name: m.name || "Friend" } } as any)}>
            <Avatar uri={m.picture} name={m.name} />
            <View style={{ flex: 1 }}><Text style={styles.name}>{m.name}</Text><Text style={styles.handle}>{m.handle}</Text></View>
            <Ionicons name="chatbubble-ellipses" size={20} color={colors.brand} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  idCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  idText: { color: colors.onSurface, fontSize: 13.5 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, height: 48, marginTop: spacing.sm },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: 15 },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: spacing.lg, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: { backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand },
  avatarText: { color: colors.brand, fontWeight: "900", fontSize: 16 },
  name: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  handle: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  addBtnText: { color: colors.onBrand, fontWeight: "900", fontSize: 12.5 },
  declineBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
  tag: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 12.5 },
  hint: { color: colors.onSurfaceSecondary, textAlign: "center", padding: spacing.md },
});
