import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type M = { user_id: string; name?: string; handle?: string };

export default function ManageGroup() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const gid = String(id);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [meId, setMeId] = useState("");
  const [members, setMembers] = useState<M[]>([]);
  const [friends, setFriends] = useState<M[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [savingName, setSavingName] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pinned, setPinned] = useState("");
  const [savingPin, setSavingPin] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, me, f] = await Promise.all([api.groupGet(gid), api.me(), api.friends()]);
      setName(g.group?.name || "");
      setOwnerId(g.group?.owner_id || "");
      setMembers(g.group?.members || []);
      setMeId(me?.user?.user_id || "");
      setFriends(f.friends || []);
      setPinned(g.group?.pinned_note || "");
    } catch (e: any) {
      Alert.alert("Couldn't load", e?.message || "Try again.");
    }
    setLoading(false);
    setSel(new Set());
  }, [gid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwner = !!meId && meId === ownerId;
  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = friends.filter((f) => !memberIds.has(f.user_id));

  const saveName = async () => {
    const n = name.trim();
    if (!n) { Alert.alert("Name needed", "Give your group a name."); return; }
    setSavingName(true);
    try { await api.groupRename(gid, n); Alert.alert("Saved", "Group renamed."); }
    catch (e: any) { Alert.alert("Couldn't rename", e?.message || "Try again."); }
    setSavingName(false);
  };

  const savePin = async () => {
    setSavingPin(true);
    try { await api.groupSetPin(gid, pinned); Alert.alert("Saved", "Pinned note updated."); }
    catch (e: any) { Alert.alert("Couldn't save", e?.message || "Try again."); }
    setSavingPin(false);
  };

  const toggle = (uid: string) => setSel((s) => { const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const addMembers = async () => {
    if (sel.size === 0) return;
    setAdding(true);
    try { await api.groupAddMembers(gid, Array.from(sel)); await load(); }
    catch (e: any) { Alert.alert("Couldn't add", e?.message || "Try again."); }
    setAdding(false);
  };

  const removeMember = (m: M) => {
    Alert.alert("Remove member", `Remove ${m.name || "this member"} from the group?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try { await api.groupRemoveMember(gid, m.user_id); await load(); }
        catch (e: any) { Alert.alert("Couldn't remove", e?.message || "Try again."); }
      } },
    ]);
  };

  const leave = () => {
    Alert.alert("Leave group", "Are you sure you want to leave this group?", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: async () => {
        try { await api.groupLeave(gid); router.replace("/(tabs)/inbox"); }
        catch (e: any) { Alert.alert("Couldn't leave", e?.message || "Try again."); }
      } },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScreenHeader title="Manage group" fallback="/(tabs)/inbox" />
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Manage group" fallback="/(tabs)/inbox" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 }}>
        {isOwner ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.section}>GROUP NAME</Text>
            <TextInput testID="manage-name" value={name} onChangeText={setName} placeholder="Group name" placeholderTextColor={colors.onSurfaceSecondary} style={styles.name} />
            <Pressable testID="manage-save-name" style={styles.saveBtn} onPress={saveName} disabled={savingName}>
              {savingName ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>Save name</Text>}
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={styles.section}>GROUP</Text>
            <Text style={styles.gname}>{name}</Text>
          </View>
        )}

        {isOwner && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.section}>PINNED NOTE / RULES</Text>
            <Text style={styles.hint}>Shown pinned at the top of the chat for everyone.</Text>
            <TextInput testID="manage-pin" value={pinned} onChangeText={setPinned} placeholder="Welcome message, rules, etc." placeholderTextColor={colors.onSurfaceSecondary} style={styles.pinInput} multiline />
            <Pressable testID="manage-save-pin" style={styles.saveBtn} onPress={savePin} disabled={savingPin}>
              {savingPin ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>Save pinned note</Text>}
            </Pressable>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          <Text style={styles.section}>MEMBERS ({members.length})</Text>
          {members.map((m) => (
            <View key={m.user_id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rname}>{m.name}{m.user_id === ownerId ? "  ·  Owner" : ""}{m.user_id === meId ? "  (you)" : ""}</Text>
                {!!m.handle && <Text style={styles.rid}>{m.handle}</Text>}
              </View>
              {isOwner && m.user_id !== meId && (
                <Pressable testID={`manage-remove-${m.user_id}`} hitSlop={8} onPress={() => removeMember(m)}>
                  <Ionicons name="close-circle" size={24} color={"#EF4444"} />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {isOwner && (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.section}>ADD FRIENDS ({sel.size})</Text>
            {addable.length === 0 ? (
              <Text style={styles.hint}>All your friends are already in this group.</Text>
            ) : addable.map((f) => {
              const on = sel.has(f.user_id);
              return (
                <Pressable key={f.user_id} testID={`manage-add-${f.user_id}`} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(f.user_id)}>
                  <View style={{ flex: 1 }}><Text style={styles.rname}>{f.name}</Text>{!!f.handle && <Text style={styles.rid}>{f.handle}</Text>}</View>
                  <Ionicons name={on ? "checkmark-circle" : "add-circle-outline"} size={24} color={on ? colors.brand : colors.onSurfaceSecondary} />
                </Pressable>
              );
            })}
            {sel.size > 0 && (
              <Pressable testID="manage-add-confirm" style={styles.saveBtn} onPress={addMembers} disabled={adding}>
                {adding ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>Add {sel.size} to group</Text>}
              </Pressable>
            )}
          </View>
        )}

        <Pressable testID="manage-leave" style={styles.leaveBtn} onPress={leave}>
          <Ionicons name="exit-outline" size={18} color={"#EF4444"} />
          <Text style={styles.leaveText}>Leave group</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  gname: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  name: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, color: colors.onSurface, fontSize: 16 },
  pinInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, color: colors.onSurface, fontSize: 14.5, minHeight: 120, textAlignVertical: "top", lineHeight: 20 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  saveText: { color: colors.onBrand, fontWeight: "900", fontSize: 14.5 },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  rowOn: { borderColor: colors.brand },
  rname: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rid: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  hint: { color: colors.onSurfaceSecondary, padding: spacing.md },
  leaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: "#EF4444", borderRadius: radius.md, paddingVertical: 13, marginTop: spacing.md },
  leaveText: { color: "#EF4444", fontWeight: "900", fontSize: 14.5 },
});
