import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type M = { user_id: string; name?: string; handle?: string };

export default function NewGroup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [friends, setFriends] = useState<M[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const f = await api.friends(); setFriends(f.friends || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const create = async () => {
    if (!name.trim()) { Alert.alert("Name needed", "Give your group a name."); return; }
    if (sel.size === 0) { Alert.alert("Add friends", "Pick at least one friend for the group."); return; }
    setSaving(true);
    try { const r = await api.createGroup(name.trim(), Array.from(sel)); router.replace({ pathname: "/group/[id]", params: { id: r.group_id, name: name.trim() } } as any); }
    catch (e: any) { Alert.alert("Couldn't create", e?.message || "Try again."); }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="New Group" fallback="/(tabs)/inbox" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <TextInput testID="group-name" value={name} onChangeText={setName} placeholder="Group name (e.g. Fight Team)" placeholderTextColor={colors.onSurfaceSecondary} style={styles.name} />
        <Text style={styles.section}>ADD FRIENDS ({sel.size})</Text>
        {friends.length === 0 ? (
          <Text style={styles.hint}>Add some friends first, then create a group.</Text>
        ) : friends.map((f) => {
          const on = sel.has(f.user_id);
          return (
            <Pressable key={f.user_id} testID={`grp-sel-${f.user_id}`} style={[styles.row, on && styles.rowOn]} onPress={() => toggle(f.user_id)}>
              <View style={{ flex: 1 }}><Text style={styles.rname}>{f.name}</Text><Text style={styles.rid}>{f.handle}</Text></View>
              <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={24} color={on ? colors.brand : colors.onSurfaceSecondary} />
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable testID="group-create" style={styles.createBtn} onPress={create} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.createText}>Create group</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  name: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, color: colors.onSurface, fontSize: 16 },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  hint: { color: colors.onSurfaceSecondary, textAlign: "center", padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  rowOn: { borderColor: colors.brand },
  rname: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rid: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  createBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, alignItems: "center" },
  createText: { color: colors.onBrand, fontWeight: "900", fontSize: 15 },
});
