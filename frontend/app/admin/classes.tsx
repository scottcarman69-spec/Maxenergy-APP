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
  Switch,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { classTime, classDate, classParts } from "@/src/datetime";
import { Segmented } from "@/src/components/Form";
import ScreenHeader from "@/src/components/ScreenHeader";

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
  by_appointment?: boolean;
  cancelled?: boolean;
  cancel_reason?: string;
};

function toDateStr(iso: string) {
  const p = classParts(iso);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
function toTimeStr(iso: string) {
  const p = classParts(iso);
  return `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
}
function fmtLabel(iso: string) {
  return `${classDate(iso, { weekday: "short", day: "2-digit", month: "short" })} · ${classTime(iso)}`;
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
  by_appointment: false,
};

export default function AdminClasses() {
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // class_id or "new" or null
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<Cls | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [autoReturnPasses, setAutoReturnPasses] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
      by_appointment: !!c.by_appointment,
    });
    setEditing(c.class_id);
    setErr(null);
  };

  const save = async () => {
    setErr(null);
    const appt = form.by_appointment;
    if (!form.name || !form.trainer || (!appt && (!form.date || !form.time))) {
      setErr(appt ? "Fill name and trainer" : "Fill name, trainer, date and time");
      return;
    }
    const payload: any = {
      name: form.name,
      category: form.category,
      trainer: form.trainer,
      level: form.level,
      duration_min: parseInt(form.duration_min || "60", 10),
      price_cents: Math.round(parseFloat(form.price || "0") * 100),
      capacity: appt ? 1 : parseInt(form.capacity || "20", 10),
      description: form.description,
      by_appointment: appt,
    };
    if (!appt) payload.start_at = `${form.date}T${form.time}:00`;
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

  const confirmCancel = async () => {
    if (!cancelFor) return;
    setCancelling(true);
    try {
      const r = await api.adminCancelClass(cancelFor.class_id, cancelReason.trim(), autoReturnPasses);
      const n = r?.notified ?? 0;
      const pr = r?.passes_returned ?? 0;
      setToast(`Class cancelled. ${n} member${n === 1 ? "" : "s"} notified${pr ? `, ${pr} pass${pr === 1 ? "" : "es"} returned` : ""}.`);
      setCancelFor(null);
      setCancelReason("");
      setAutoReturnPasses(true);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not cancel class");
    } finally {
      setCancelling(false);
    }
  };

  const restore = async (id: string) => {
    try {
      await api.adminRestoreClass(id);
      setToast("Class restored. It's visible to members again.");
      await load();
    } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Manage Classes"
        backTestID="adminc-back"
        fallback="/admin"
        right={
          <Pressable testID="adminc-add" onPress={openNew} hitSlop={12}>
            <Ionicons name="add-circle" size={28} color={colors.brand} />
          </Pressable>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}>
          {classes.map((c) => (
            <View key={c.class_id} testID={`adminc-row-${c.class_id}`} style={[styles.row, c.cancelled && styles.rowCancelled]}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, c.cancelled && styles.nameCancelled]}>{c.name}</Text>
                  {c.cancelled ? (
                    <View style={styles.cancelBadge}>
                      <Ionicons name="close-circle" size={12} color="#fff" />
                      <Text style={styles.cancelBadgeText}>CANCELLED</Text>
                    </View>
                  ) : (
                    <View style={[styles.tag, { backgroundColor: c.category === "Kids" ? "rgba(34,197,94,0.15)" : colors.brandTertiary }]}>
                      <Text style={[styles.tagText, { color: c.category === "Kids" ? "#22C55E" : colors.brand }]}>{c.category}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>{c.by_appointment ? "By appointment" : fmtLabel(c.start_at)} · {c.trainer}</Text>
                <Text style={styles.meta}>${(c.price_cents / 100).toFixed(0)} · {c.duration_min}m</Text>
                {c.cancelled && !!c.cancel_reason && <Text style={styles.reasonMeta}>Reason: {c.cancel_reason}</Text>}
                {c.cancelled ? (
                  <Pressable testID={`adminc-restore-${c.class_id}`} onPress={() => restore(c.class_id)} style={styles.restoreBtn}>
                    <Ionicons name="refresh" size={14} color={colors.brand} />
                    <Text style={styles.restoreText}>Restore class</Text>
                  </Pressable>
                ) : (
                  <Pressable testID={`adminc-cancel-${c.class_id}`} onPress={() => { setCancelFor(c); setCancelReason(""); setAutoReturnPasses(true); setErr(null); }} style={styles.cancelClassBtn}>
                    <Ionicons name="megaphone-outline" size={14} color={colors.error} />
                    <Text style={styles.cancelClassText}>Cancel & notify members</Text>
                  </Pressable>
                )}
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

                <Pressable
                  testID="adminc-appt-toggle"
                  style={styles.toggleRow}
                  onPress={() => setForm({ ...form, by_appointment: !form.by_appointment })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>By appointment</Text>
                    <Text style={styles.toggleHint}>No fixed time — members request a booking (e.g. Personal Training, Custom Programs)</Text>
                  </View>
                  <View style={[styles.switch, form.by_appointment && styles.switchOn]}>
                    <View style={[styles.knob, form.by_appointment && styles.knobOn]} />
                  </View>
                </Pressable>

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

                <View style={styles.field}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    testID="adminc-description"
                    value={form.description}
                    onChangeText={(t) => setForm({ ...form, description: t })}
                    placeholder="What this session involves"
                    placeholderTextColor={colors.onSurfaceSecondary}
                    multiline
                    style={[styles.input, { minHeight: 84, textAlignVertical: "top" }]}
                  />
                </View>

                {!form.by_appointment && (
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
                )}
                <View style={styles.rowFields}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Duration (min)</Text>
                    <TextInput testID="adminc-duration" value={form.duration_min} onChangeText={(t) => setForm({ ...form, duration_min: t })} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Price ($)</Text>
                    <TextInput testID="adminc-price" value={form.price} onChangeText={(t) => setForm({ ...form, price: t })} keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                  </View>
                  {!form.by_appointment && (
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Capacity</Text>
                      <TextInput testID="adminc-capacity" value={form.capacity} onChangeText={(t) => setForm({ ...form, capacity: t })} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} />
                    </View>
                  )}
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
      {toast && (
        <Pressable testID="adminc-toast" style={styles.toast} onPress={() => setToast(null)}>
          <Ionicons name="checkmark-circle" size={16} color={colors.onBrand} />
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      )}

      {cancelFor && (
        <View style={styles.modalOverlay}>
          <View style={styles.confirmWrap}>
            <View style={styles.confirmCard}>
              <View style={styles.confirmIcon}>
                <Ionicons name="warning" size={24} color={colors.error} />
              </View>
              <Text style={styles.confirmTitle}>Cancel this class?</Text>
              <Text style={styles.confirmSub}>
                {cancelFor.name}{cancelFor.by_appointment ? "" : ` · ${fmtLabel(cancelFor.start_at)}`}
              </Text>
              <Text style={styles.confirmBody}>
                All booked members will have their booking cancelled and be notified by app and email. The class will be hidden from members but stays here so you can edit or restore it.
              </Text>
              <Text style={styles.label}>Reason (optional — shown to members)</Text>
              <TextInput
                testID="adminc-cancel-reason"
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="e.g. Coach unavailable, venue closed"
                placeholderTextColor={colors.onSurfaceSecondary}
                multiline
                style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
              />
              <View style={[styles.toggleRow, { marginTop: spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Auto-return class passes</Text>
                  <Text style={styles.toggleSub}>Members who booked with a class pass get it back instantly.</Text>
                </View>
                <Switch
                  testID="adminc-auto-return-passes"
                  value={autoReturnPasses}
                  onValueChange={setAutoReturnPasses}
                  trackColor={{ false: colors.border, true: "#22C55E" }}
                  thumbColor="#fff"
                />
              </View>
              {err && <Text style={styles.error}>{err}</Text>}
              <View style={styles.confirmActions}>
                <Pressable testID="adminc-cancel-abort" style={styles.confirmGhost} onPress={() => setCancelFor(null)} disabled={cancelling}>
                  <Text style={styles.confirmGhostText}>Keep class</Text>
                </Pressable>
                <Pressable testID="adminc-cancel-confirm" style={[styles.confirmDanger, cancelling && { opacity: 0.5 }]} onPress={confirmCancel} disabled={cancelling}>
                  {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmDangerText}>CANCEL & NOTIFY</Text>}
                </Pressable>
              </View>
            </View>
          </View>
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
  rowCancelled: { opacity: 0.85, borderColor: colors.error },
  nameCancelled: { textDecorationLine: "line-through", color: colors.onSurfaceSecondary },
  cancelBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.error, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill },
  cancelBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  reasonMeta: { color: colors.error, fontSize: 12, marginTop: 4, fontStyle: "italic" },
  cancelClassBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.error },
  toggleTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  toggleSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 },
  cancelClassText: { color: colors.error, fontSize: 12, fontWeight: "800" },
  restoreBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  restoreText: { color: colors.brand, fontSize: 12, fontWeight: "800" },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 24, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.md },
  toastText: { color: colors.onBrand, fontSize: 13, fontWeight: "700", flex: 1 },
  confirmWrap: { flex: 1, justifyContent: "center", padding: spacing.xl },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  confirmIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(239,68,68,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  confirmTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  confirmSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2, marginBottom: spacing.md },
  confirmBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  confirmActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  confirmGhost: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  confirmGhostText: { color: colors.onSurface, fontWeight: "800" },
  confirmDanger: { flex: 1.4, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.error },
  confirmDangerText: { color: "#fff", fontWeight: "900", letterSpacing: 0.5 },
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
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  toggleLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  toggleHint: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3, lineHeight: 16 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, padding: 3, justifyContent: "center" },
  switchOn: { backgroundColor: colors.brand },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  knobOn: { alignSelf: "flex-end" },
});
