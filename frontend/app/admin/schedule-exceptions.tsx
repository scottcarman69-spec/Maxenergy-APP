import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, Switch, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { api } from "@/src/api";

type Exc = {
  exception_id: string;
  label: string;
  start_date: string;
  end_date: string;
  scope: "all" | "selected";
  categories: string[];
  class_names: string[];
  active: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (iso: string) => {
  try { return new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); }
  catch { return iso; }
};

export default function ScheduleExceptions() {
  const [excs, setExcs] = useState<Exc[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Exc | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.scheduleExceptions();
      setExcs(r.exceptions || []);
      setCategories(r.categories || []);
      setClassNames(r.class_names || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setEditing(null); setShowForm(true); };
  const openEdit = (e: Exc) => { setEditing(e); setShowForm(true); };

  const toggleActive = async (e: Exc) => {
    await api.updateException(e.exception_id, { ...e, active: !e.active });
    load();
  };
  const remove = async (e: Exc) => {
    await api.deleteException(e.exception_id);
    load();
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Closed Dates / Exceptions" backTestID="exc-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 100 }}>
          <Text style={styles.help}>
            Hide classes on specific dates or ranges — public holidays, closures, or QLD school
            holidays. Choose whether it affects all classes or only selected class types.
          </Text>
          {excs.length === 0 ? (
            <Text style={styles.empty}>No exceptions yet. Tap “Add” to create one.</Text>
          ) : excs.map((e) => (
            <View key={e.exception_id} style={[styles.card, !e.active && { opacity: 0.55 }]}>
              <View style={styles.cardTop}>
                <Text style={styles.label}>{e.label}</Text>
                <Switch
                  testID={`exc-active-${e.exception_id}`}
                  value={e.active}
                  onValueChange={() => toggleActive(e)}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
              <Text style={styles.meta}>{fmt(e.start_date)}{e.end_date !== e.start_date ? `  →  ${fmt(e.end_date)}` : ""}</Text>
              <Text style={styles.scope}>
                {e.scope === "all"
                  ? "Applies to: ALL classes"
                  : `Applies to: ${[...(e.categories || []), ...(e.class_names || [])].join(", ") || "—"}`}
              </Text>
              <View style={styles.actions}>
                <Pressable testID={`exc-edit-${e.exception_id}`} style={styles.actBtn} onPress={() => openEdit(e)}>
                  <Ionicons name="create-outline" size={16} color={colors.brand} />
                  <Text style={styles.actText}>Edit</Text>
                </Pressable>
                <Pressable testID={`exc-del-${e.exception_id}`} style={styles.actBtn} onPress={() => remove(e)}>
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                  <Text style={[styles.actText, { color: colors.error }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Pressable testID="exc-add" style={styles.fab} onPress={openNew}>
        <Ionicons name="add" size={26} color={colors.onBrand} />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>

      {showForm && (
        <ExceptionForm
          initial={editing}
          categories={categories}
          classNames={classNames}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </SafeAreaView>
  );
}

function ExceptionForm({ initial, categories, classNames, onClose, onSaved }: {
  initial: Exc | null; categories: string[]; classNames: string[]; onClose: () => void; onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label || "");
  const [startDate, setStartDate] = useState(initial?.start_date || "");
  const [endDate, setEndDate] = useState(initial?.end_date || "");
  const [scope, setScope] = useState<"all" | "selected">(initial?.scope || "all");
  const [cats, setCats] = useState<string[]>(initial?.categories || []);
  const [names, setNames] = useState<string[]>(initial?.class_names || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    setErr(null);
    if (!label.trim()) return setErr("Add a label (e.g. 'QLD School Holidays').");
    if (!DATE_RE.test(startDate)) return setErr("Start date must be YYYY-MM-DD.");
    if (endDate && !DATE_RE.test(endDate)) return setErr("End date must be YYYY-MM-DD.");
    if (scope === "selected" && cats.length === 0 && names.length === 0)
      return setErr("Select at least one class type/category, or choose 'All classes'.");
    setSaving(true);
    const payload = {
      label: label.trim(), start_date: startDate, end_date: endDate || startDate,
      scope, categories: scope === "selected" ? cats : [], class_names: scope === "selected" ? names : [],
      active: initial?.active ?? true,
    };
    try {
      if (initial) await api.updateException(initial.exception_id, payload);
      else await api.createException(payload);
      onSaved();
    } catch (e: any) {
      setErr(e?.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{initial ? "Edit exception" : "New exception"}</Text>
            <Pressable testID="exc-form-close" onPress={onClose}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm, paddingBottom: 20 }}>
            <Text style={styles.flabel}>Label / reason</Text>
            <TextInput testID="exc-label" value={label} onChangeText={setLabel} placeholder="e.g. QLD School Holidays" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />

            <Text style={styles.flabel}>Start date (YYYY-MM-DD)</Text>
            <TextInput testID="exc-start" value={startDate} onChangeText={setStartDate} placeholder="2026-09-19" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} autoCapitalize="none" keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} />

            <Text style={styles.flabel}>End date (optional — leave blank for a single day)</Text>
            <TextInput testID="exc-end" value={endDate} onChangeText={setEndDate} placeholder="2026-10-05" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} autoCapitalize="none" keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "default"} />

            <Text style={styles.flabel}>Applies to</Text>
            <View style={styles.segment}>
              <Pressable testID="exc-scope-all" style={[styles.seg, scope === "all" && styles.segActive]} onPress={() => setScope("all")}>
                <Text style={[styles.segText, scope === "all" && styles.segTextActive]}>All classes</Text>
              </Pressable>
              <Pressable testID="exc-scope-selected" style={[styles.seg, scope === "selected" && styles.segActive]} onPress={() => setScope("selected")}>
                <Text style={[styles.segText, scope === "selected" && styles.segTextActive]}>Selected only</Text>
              </Pressable>
            </View>

            {scope === "selected" && (
              <>
                <Text style={styles.flabel}>By category</Text>
                <View style={styles.chips}>
                  {categories.map((c) => (
                    <Pressable key={c} testID={`exc-cat-${c}`} style={[styles.chip, cats.includes(c) && styles.chipActive]} onPress={() => toggle(cats, setCats, c)}>
                      <Text style={[styles.chipText, cats.includes(c) && styles.chipTextActive]}>{c}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.flabel}>By class name</Text>
                <View style={styles.chips}>
                  {classNames.map((n) => (
                    <Pressable key={n} testID={`exc-name-${n}`} style={[styles.chip, names.includes(n) && styles.chipActive]} onPress={() => toggle(names, setNames, n)}>
                      <Text style={[styles.chipText, names.includes(n) && styles.chipTextActive]}>{n}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>Tip: for Kids Muay Thai, select the “Kids” category.</Text>
              </>
            )}

            {err && <Text style={styles.error}>{err}</Text>}

            <Pressable testID="exc-save" style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
              {saving ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>{initial ? "SAVE CHANGES" : "CREATE EXCEPTION"}</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  help: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 30 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 4 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  meta: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  scope: { color: colors.onSurfaceSecondary, fontSize: 12 },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  actBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  actText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  fab: { position: "absolute", right: spacing.lg, bottom: spacing.xl, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 14, borderRadius: 999, elevation: 4 },
  fabText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 0.5 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", borderWidth: 1, borderColor: colors.border },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  flabel: { color: colors.onSurface, fontSize: 12, fontWeight: "800", marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, fontSize: 15 },
  segment: { flexDirection: "row", gap: spacing.sm },
  seg: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segText: { color: colors.onSurface, fontWeight: "700" },
  segTextActive: { color: colors.onBrand },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  chipTextActive: { color: colors.onBrand },
  hint: { color: colors.onSurfaceSecondary, fontSize: 12, fontStyle: "italic" },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  saveText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
