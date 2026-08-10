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
import { Segmented } from "@/src/components/Form";

type Cls = {
  class_id: string;
  name: string;
  category: string;
  trainer: string;
  level: string;
  duration_min: number;
  price_cents: number;
  start_at: string;
  capacity: number;
  description?: string;
};

function toDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function toTimeStr(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtLabel(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })} · ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`;
}

const emptyForm = {
  name: "",
  category: "Adults",
  trainer: "",
  level: "All levels",
  duration_min: "60",
  price: "25",
  date: toDateStr(new Date().toISOString()),
  time: "18:00",
  capacity: "20",
  description: "",
};

export default function AdminClasses() {
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // class_id or "new" or null
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminClasses();
      setClasses(r.classes || []);
    } catch (e: any) {
      setErr(e?.message);
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    setForm({ ...emptyForm });
    setEditing("new");
    setErr(null);
  };
  const openEdit = (c: Cls) => {
    setForm({
      name: c.name,
      category: c.category,
      trainer: c.trainer,
      level: c.level,
      duration_min: String(c.duration_min),
      price: String(c.price_cents / 100),
      date: toDateStr(c.start_at),
      time: toTimeStr(c.start_at),
      capacity: String(c.capacity),
      description: c.description || "",
    });
    setEditing(c.class_id);
    setErr(null);
  };

  const save = async () => {
    setErr(null);
    if (!form.name || !form.trainer || !form.date || !form.time) {
      setErr("Fill name, trainer, date and time");
      return;
    }
    const start_at = `${form.date}T${form.time}:00`;
    const payload = {
      name: form.name,
      category: form.category,
      trainer: form.trainer,
      level: form.level,
      duration_min: parseInt(form.duration_min || "60", 10),
      price_cents: Math.round(parseFloat(form.price || "0") * 100),
      start_at,
      capacity: parseInt(form.capacity || "20", 10),
      description: form.description,
    };
    setSaving(true);
    try {
      if (editing === "new") await api.adminCreateClass(payload);
      else if (editing) await api.adminUpdateClass(editing, payload);
      setEditing(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.adminDeleteClass(id);
      setClasses((c) => c.filter((x) => x.class_id !== id));
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="adminc-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Classes</Text>
        <Pressable testID="adminc-add" onPress={openNew} hitSlop={12}>
          <Ionicons name="add-circle" size={28} color={colors.brand} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}>
          {classes.map((c) => (
            <View key={c.class_id} testID={`adminc-row-${c.class_id}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{c.name}</Text>
                  <View style={[styles.tag, { backgroundColor: c.category === "Kids" ? "rgba(34,197,94,0.15)" : colors.brandTertiary }]}>
                    <Text style={[styles.tagText, { color: c.category === "Kids" ? "#22C55E" : colors.brand }]}>{c.category}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>{fmtLabel(c.start_at)} · {c.trainer}</Text>
                <Text style={styles.meta}>${(c.price_cents / 100).toFixed(0)} · {c.duration_min}m</Text>
              </View>
              <Pressable testID={`adminc-edit-${c.class_id}`} onPress={() => openEdit(c)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={20} color={colors.onSurface} />
              </Pressable>
              <Pressable testID={`adminc-del-${c.class_id}`} onPress={() => remove(c.class_id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {editing && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing === "new" ? "New Class" : "Edit Class"}</Text>
                <Pressable testID="adminc-close" onPress={() => setEditing(null)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.onSurface} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg }}>
                <Text style={styles.label}>Category</Text>
                <Segmented options={["Adults", "Kids"]} value={form.category} onChange={(v) => setForm({ ...form, category: v })} testIDPrefix="adminc-cat" />
                <View style={{ height: spacing.md }} />
                {[
                  { k: "name", l: "Class name", ph: "e.g. Adult Muay Thai" },
                  { k: "trainer", l: "Trainer", ph: "e.g. Coach Alex" },
                  { k: "level", l: "Level", ph: "e.g. All levels" },
                ].map((f) => (
                  <View key={f.k} style={styles.field}>
                    <Text style={styles.label}>{f.l}</Text>
                    <TextInput
                      testID={`adminc-${f.k}`}
                      value={(form as any)[f.k]}
                      onChangeText={(t) => setForm({ ...form, [f.k]: t })}
                      placeholder={f.ph}
                      placeholderTextColor={colors.onSurfaceSecondary}
                      style={styles.input}
                    />
                  </View>
                ))}
                <View style={styles.rowFields}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Date</Text>
                    <TextInput testID="adminc-date" value={form.date} onChangeText={(t) => setForm({ ...form, date: t })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Time (24h)</Text>
                    <TextInput testID="adminc-time" value={form.time} onChangeText={(t) => setForm({ ...form, time: t })} placeholder="18:00" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                </View>
                <View style={styles.rowFields}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Duration (min)</Text>
                    <TextInput testID="adminc-duration" value={form.duration_min} onChangeText={(t) => setForm({ ...form, duration_min: t })} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Price ($)</Text>
                    <TextInput testID="adminc-price" value={form.price} onChangeText={(t) => setForm({ ...form, price: t })} keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Capacity</Text>
                    <TextInput testID="adminc-capacity" value={form.capacity} onChangeText={(t) => setForm({ ...form, capacity: t })} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                </View>
                {err && <Text style={styles.error}>{err}</Text>}
                <Pressable testID="adminc-save" style={[styles.saveBtn, saving && { opacity: 0.5 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>SAVE CLASS</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  tagText: { fontSize: 10, fontWeight: "900" },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  iconBtn: { padding: 6 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalWrap: { maxHeight: "90%" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  field: { marginBottom: spacing.md },
  rowFields: { flexDirection: "row", gap: spacing.sm },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  error: { color: colors.error, fontSize: 13, marginBottom: spacing.sm },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
  saveText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
