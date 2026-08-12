import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type CreateReq = { request_id: string; name: string; requester_name: string; requester_email?: string; member_count: number };
type JoinReq = { request_id: string; group_id: string; group_name: string; member_name: string; member_email?: string };

export default function AdminGroupRequests() {
  const [creates, setCreates] = useState<CreateReq[]>([]);
  const [joins, setJoins] = useState<JoinReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminGroupRequests();
      setCreates(r.create_requests || []);
      setJoins(r.join_requests || []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const decideCreate = async (id: string, approve: boolean) => {
    setBusy(id);
    try { await api.adminGroupRequestDecide(id, approve); await load(); } catch {}
    setBusy(null);
  };
  const decideJoin = async (id: string, approve: boolean) => {
    setBusy(id);
    try { await api.adminGroupJoinDecide(id, approve); await load(); } catch {}
    setBusy(null);
  };

  const empty = creates.length === 0 && joins.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Group Requests" backTestID="greq-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}>
          {empty && (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No pending requests. You're all caught up!</Text>
            </View>
          )}

          {creates.length > 0 && <Text style={styles.section}>NEW GROUP REQUESTS ({creates.length})</Text>}
          {creates.map((c) => (
            <View key={c.request_id} testID={`greq-create-${c.request_id}`} style={styles.card}>
              <View style={styles.rowTop}>
                <Ionicons name="people" size={20} color={colors.brand} />
                <Text style={styles.title} numberOfLines={1}>{c.name}</Text>
              </View>
              <Text style={styles.meta}>Requested by {c.requester_name}{c.member_count > 1 ? ` · ${c.member_count} members` : ""}</Text>
              <View style={styles.actions}>
                <Pressable testID={`greq-create-approve-${c.request_id}`} style={[styles.btn, styles.approve]} onPress={() => decideCreate(c.request_id, true)} disabled={busy === c.request_id}>
                  {busy === c.request_id ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.btnText}>Approve</Text></>}
                </Pressable>
                <Pressable testID={`greq-create-decline-${c.request_id}`} style={[styles.btn, styles.decline]} onPress={() => decideCreate(c.request_id, false)} disabled={busy === c.request_id}>
                  <Ionicons name="close" size={16} color="#EF4444" /><Text style={[styles.btnText, { color: "#EF4444" }]}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {joins.length > 0 && <Text style={styles.section}>JOIN REQUESTS ({joins.length})</Text>}
          {joins.map((j) => (
            <View key={j.request_id} testID={`greq-join-${j.request_id}`} style={styles.card}>
              <View style={styles.rowTop}>
                <Ionicons name="person-add" size={20} color={colors.brand} />
                <Text style={styles.title} numberOfLines={1}>{j.member_name}</Text>
              </View>
              <Text style={styles.meta}>Wants to join <Text style={{ fontWeight: "900", color: colors.onSurface }}>{j.group_name}</Text></Text>
              <View style={styles.actions}>
                <Pressable testID={`greq-join-approve-${j.request_id}`} style={[styles.btn, styles.approve]} onPress={() => decideJoin(j.request_id, true)} disabled={busy === j.request_id}>
                  {busy === j.request_id ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={styles.btnText}>Accept</Text></>}
                </Pressable>
                <Pressable testID={`greq-join-decline-${j.request_id}`} style={[styles.btn, styles.decline]} onPress={() => decideJoin(j.request_id, false)} disabled={busy === j.request_id}>
                  <Ionicons name="close" size={16} color="#EF4444" /><Text style={[styles.btnText, { color: "#EF4444" }]}>Decline</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginTop: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 6 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: 6 },
  btn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: radius.md, paddingVertical: 11 },
  approve: { backgroundColor: "#22C55E" },
  decline: { borderWidth: 1, borderColor: "#EF4444" },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
});
