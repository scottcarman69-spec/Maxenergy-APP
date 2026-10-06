import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { Checkbox } from "@/src/components/Form";
import ScreenHeader from "@/src/components/ScreenHeader";
import { NOTICE_CATEGORIES, noticeCat } from "@/src/noticeCategories";

type Ann = { announcement_id: string; title: string; body: string; pinned: boolean; author: string; created_at: string; category?: string };

export default function AdminAnnouncements() {
  const router = useRouter();
  const [anns, setAnns] = useState<Ann[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [category, setCategory] = useState<string>("general");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.announcements();
      setAnns(r.announcements || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setTitle("");
    setBody("");
    setPinned(false);
    setCategory("general");
    setEditingId(null);
  };

  const startEdit = (a: Ann) => {
    setEditingId(a.announcement_id);
    setTitle(a.title);
    setBody(a.body);
    setPinned(a.pinned);
    setCategory(a.category || "general");
    setShowForm(true);
  };

  const post = async () => {
    setErr(null);
    if (!title || !body) {
      setErr("Enter a title and message");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.adminUpdateAnnouncement(editingId, { title, body, pinned, category });
      } else {
        await api.adminCreateAnnouncement({ title, body, pinned, category });
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.adminDeleteAnnouncement(id);
      setAnns((a) => a.filter((x) => x.announcement_id !== id));
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Gym Notices"
        backTestID="admina-back"
        fallback="/admin"
        right={
          <Pressable testID="admina-add" onPress={() => { if (showForm) { resetForm(); } setShowForm((s) => !s); }} hitSlop={12}>
            <Ionicons name={showForm ? "close-circle" : "add-circle"} size={28} color={colors.brand} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {showForm && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>{editingId ? "Edit notice" : "New announcement"}</Text>
              <TextInput
                testID="admina-title"
                value={title}
                onChangeText={setTitle}
                placeholder="Title"
                placeholderTextColor={colors.onSurfaceSecondary}
                style={styles.input}
              />
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catPicker}>
                {NOTICE_CATEGORIES.map((c) => {
                  const active = category === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      testID={`admina-cat-${c.value}`}
                      onPress={() => setCategory(c.value)}
                      style={[styles.catChip, { borderColor: c.color }, active && { backgroundColor: c.color }]}
                    >
                      <Ionicons name={c.icon as any} size={13} color={active ? "#fff" : c.color} />
                      <Text style={[styles.catChipText, { color: active ? "#fff" : c.color }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                testID="admina-body"
                value={body}
                onChangeText={setBody}
                placeholder="Message to members..."
                placeholderTextColor={colors.onSurfaceSecondary}
                multiline
                style={[styles.input, { minHeight: 90, textAlignVertical: "top", marginTop: spacing.sm }]}
              />
              <Checkbox testID="admina-pinned" label="Pin to top" value={pinned} onToggle={() => setPinned((p) => !p)} />
              {err && <Text style={styles.error}>{err}</Text>}
              <Pressable testID="admina-post" style={[styles.postBtn, saving && { opacity: 0.5 }]} onPress={post} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.postText}>{editingId ? "SAVE CHANGES" : "POST NOTICE"}</Text>}
              </Pressable>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
          ) : (
            anns.map((a) => (
              <View key={a.announcement_id} testID={`admina-row-${a.announcement_id}`} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    {a.pinned && <Ionicons name="pin" size={14} color={colors.brand} />}
                    <Text style={styles.name}>{a.title}</Text>
                  </View>
                  <View style={[styles.catTag, { backgroundColor: noticeCat(a.category).color }]}>
                    <Ionicons name={noticeCat(a.category).icon as any} size={10} color="#fff" />
                    <Text style={styles.catTagText}>{noticeCat(a.category).label}</Text>
                  </View>
                  <Text style={styles.body} numberOfLines={2}>{a.body}</Text>
                </View>
                <Pressable testID={`admina-edit-${a.announcement_id}`} onPress={() => startEdit(a)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={20} color={colors.brand} />
                </Pressable>
                <Pressable testID={`admina-del-${a.announcement_id}`} onPress={() => remove(a.announcement_id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  form: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  formTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginBottom: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  fieldLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.md, marginBottom: spacing.sm, letterSpacing: 0.5, textTransform: "uppercase" },
  catPicker: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  catChipText: { fontSize: 12.5, fontWeight: "700" },
  catTag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  catTagText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  postBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  postText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  body: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  iconBtn: { padding: 6 },
});
