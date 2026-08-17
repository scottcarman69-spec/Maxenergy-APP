import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, Child } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

export default function Children() {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Child | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await api.myChildren(); setChildren(r.children || []); } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => { setEditing(null); setName(""); setAge(""); setErr(null); setModalOpen(true); };
  const openEdit = (c: Child) => { setEditing(c); setName(c.name); setAge(String(c.age)); setErr(null); setModalOpen(true); };

  const save = async () => {
    const n = name.trim();
    const a = parseInt(age, 10);
    if (!n) { setErr("Please enter the child's name."); return; }
    if (!Number.isFinite(a) || a < 1 || a > 100) { setErr("Please enter a valid age."); return; }
    setSaving(true); setErr(null);
    try {
      const r = editing ? await api.updateChild(editing.child_id, n, a) : await api.addChild(n, a);
      setChildren(r.children || []);
      setModalOpen(false);
    } catch (e: any) { setErr(e?.message || "Couldn't save. Please try again."); }
    setSaving(false);
  };

  const remove = (c: Child) => {
    Alert.alert("Remove child?", `Remove ${c.name} from your saved children?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setChildren((cur) => cur.filter((x) => x.child_id !== c.child_id));
        try { await api.deleteChild(c.child_id); } catch { load(); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="My Children" subtitle="Saved for quick class booking" fallback="/(tabs)/profile" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={styles.intro}>Save each child once, then just pick who's attending when you book a Kids class.</Text>

          {children.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="happy-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No children saved yet.</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {children.map((c) => (
                <View key={c.child_id} style={styles.row} testID={`child-row-${c.child_id}`}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.name}</Text>
                    <Text style={styles.age}>{c.age} years old</Text>
                  </View>
                  <Pressable testID={`child-edit-${c.child_id}`} hitSlop={10} style={styles.iconBtn} onPress={() => openEdit(c)}>
                    <Ionicons name="pencil" size={18} color={colors.brand} />
                  </Pressable>
                  <Pressable testID={`child-delete-${c.child_id}`} hitSlop={10} style={styles.iconBtn} onPress={() => remove(c)}>
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <Pressable testID="child-add" style={styles.addBtn} onPress={openAdd}>
            <Ionicons name="add-circle" size={20} color={colors.onBrand} />
            <Text style={styles.addBtnText}>Add a child</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{editing ? "Edit child" : "Add a child"}</Text>
            <Text style={styles.label}>NAME</Text>
            <TextInput
              testID="child-name-input"
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Child's name"
              placeholderTextColor={colors.onSurfaceSecondary}
              maxLength={40}
              autoFocus
            />
            <Text style={styles.label}>AGE</Text>
            <TextInput
              testID="child-age-input"
              style={styles.input}
              value={age}
              onChangeText={(t) => setAge(t.replace(/[^0-9]/g, "").slice(0, 3))}
              placeholder="Age in years"
              placeholderTextColor={colors.onSurfaceSecondary}
              keyboardType="number-pad"
              maxLength={3}
            />
            {err && <Text style={styles.err}>{err}</Text>}
            <View style={styles.actions}>
              <Pressable style={styles.cancel} onPress={() => setModalOpen(false)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable testID="child-save" style={[styles.submit, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.submitText}>{editing ? "SAVE" : "ADD"}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 20, marginBottom: spacing.lg },
  empty: { alignItems: "center", padding: 30, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrand, fontSize: 18, fontWeight: "900" },
  name: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  age: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  iconBtn: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 15, marginTop: spacing.xl },
  addBtnText: { color: colors.onBrand, fontWeight: "900", fontSize: 15 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading, marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 16 },
  err: { color: colors.error, fontSize: 13, marginTop: spacing.md, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  cancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.onSurface, fontWeight: "800" },
  submit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  submitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
