import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Modal } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

export default function AccountScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setErr(null); setOk(false);
    if (!current) return setErr("Enter your current password.");
    if (next.length < 8) return setErr("New password must be at least 8 characters.");
    if (next !== confirm) return setErr("New passwords don't match.");
    setBusy(true);
    try {
      const r = await api.changePassword(current, next);
      if (r?.token) await setToken(r.token);
      setCurrent(""); setNext(""); setConfirm(""); setOk(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't change password.");
    }
    setBusy(false);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteAccount();
      setShowDelete(false);
      await logout();
    } catch {
      setShowDelete(false);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Account" backTestID="account-back" fallback="/inbox-settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
        <Text style={styles.section}>CHANGE PASSWORD</Text>
        <View style={styles.card}>
          <TextInput testID="cp-current" value={current} onChangeText={setCurrent} placeholder="Current password" placeholderTextColor={colors.onSurfaceSecondary} secureTextEntry style={styles.input} />
          <TextInput testID="cp-new" value={next} onChangeText={setNext} placeholder="New password" placeholderTextColor={colors.onSurfaceSecondary} secureTextEntry style={styles.input} />
          <TextInput testID="cp-confirm" value={confirm} onChangeText={setConfirm} placeholder="Confirm new password" placeholderTextColor={colors.onSurfaceSecondary} secureTextEntry style={styles.input} />
          {!!err && <Text style={styles.err}>{err}</Text>}
          {ok && <Text style={styles.ok}>✓ Password updated. Other devices have been signed out.</Text>}
          <Pressable testID="cp-save" style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.saveText}>UPDATE PASSWORD</Text>}
          </Pressable>
        </View>

        <Text style={[styles.section, { marginTop: spacing.lg }]}>DANGER ZONE</Text>
        <Pressable testID="account-delete" style={styles.deleteBtn} onPress={() => setShowDelete(true)}>
          <Ionicons name="trash" size={18} color={colors.error} />
          <Text style={styles.deleteText}>Delete my account</Text>
        </Pressable>
        <Text style={styles.hint}>This permanently removes your account, bookings, messages and history. This can't be undone.</Text>
      </ScrollView>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalBody}>This permanently deletes your account and all your data. This cannot be undone.</Text>
            <Pressable testID="delete-confirm" style={styles.modalDelete} onPress={doDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalDeleteText}>DELETE FOREVER</Text>}
            </Pressable>
            <Pressable testID="delete-cancel" onPress={() => setShowDelete(false)} disabled={deleting}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "900" },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: colors.onSurface, fontSize: 15 },
  err: { color: colors.error, fontSize: 13 },
  ok: { color: colors.success, fontSize: 13, fontWeight: "700" },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  saveText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.error, borderRadius: radius.md, paddingVertical: 14 },
  deleteText: { color: colors.error, fontWeight: "800", fontSize: 14 },
  hint: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 400, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center" },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  modalBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, marginBottom: 18 },
  modalDelete: { backgroundColor: colors.error, paddingVertical: 13, borderRadius: radius.md, alignSelf: "stretch", alignItems: "center" },
  modalDeleteText: { color: "#fff", fontWeight: "900", letterSpacing: 0.5 },
  modalCancel: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600", marginTop: 14 },
});
