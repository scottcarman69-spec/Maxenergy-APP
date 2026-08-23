import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { api } from "@/src/api";

type Report = {
  report_id: string;
  user_name: string;
  user_email?: string;
  message: string;
  screenshot?: string | null;
  platform?: string;
  app_version?: string;
  status: string;
  created_at: string;
};

export default function AdminBugReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminBugReports();
      setReports(r.reports || []);
    } catch {
      // ignore — pull to refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (rep: Report) => {
    const next = rep.status === "open" ? "resolved" : "open";
    setBusy(rep.report_id);
    try {
      await api.adminUpdateBugReport(rep.report_id, next);
      setReports((prev) => prev.map((x) => (x.report_id === rep.report_id ? { ...x, status: next } : x)));
    } catch {
      // no-op
    } finally {
      setBusy(null);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " +
        d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch { return ""; }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Bug Reports" backTestID="bug-reports-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : reports.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-circle-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>No bug reports yet. When members send feedback, it'll show up here.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        >
          {reports.map((rep) => (
            <View key={rep.report_id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{rep.user_name}</Text>
                  {!!rep.user_email && <Text style={styles.meta}>{rep.user_email}</Text>}
                </View>
                <View style={[styles.chip, rep.status === "resolved" ? styles.chipResolved : styles.chipOpen]}>
                  <Text style={[styles.chipText, rep.status === "resolved" ? styles.chipTextResolved : styles.chipTextOpen]}>
                    {rep.status === "resolved" ? "Resolved" : "Open"}
                  </Text>
                </View>
              </View>

              <Text style={styles.message}>{rep.message}</Text>

              {!!rep.screenshot && (
                <Pressable testID={`bug-shot-${rep.report_id}`} onPress={() => setPreview(rep.screenshot!)}>
                  <Image source={rep.screenshot} style={styles.thumb} contentFit="cover" />
                </Pressable>
              )}

              <View style={styles.cardBottom}>
                <Text style={styles.meta}>
                  {fmtDate(rep.created_at)}{rep.platform ? ` · ${rep.platform}` : ""}{rep.app_version ? ` · v${rep.app_version}` : ""}
                </Text>
                <Pressable
                  testID={`bug-toggle-${rep.report_id}`}
                  style={styles.actionBtn}
                  onPress={() => toggle(rep)}
                  disabled={busy === rep.report_id}
                >
                  {busy === rep.report_id ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : (
                    <Text style={styles.actionText}>
                      {rep.status === "open" ? "Mark resolved" : "Reopen"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.lightbox} onPress={() => setPreview(null)}>
          {!!preview && <Image source={preview} style={styles.lightboxImg} contentFit="contain" />}
          <View style={styles.lightboxClose}><Ionicons name="close" size={28} color="#fff" /></View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12 },
  message: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  thumb: { width: 120, height: 120, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipOpen: { backgroundColor: "rgba(232,80,27,0.15)" },
  chipResolved: { backgroundColor: "rgba(120,120,120,0.2)" },
  chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  chipTextOpen: { color: colors.brand },
  chipTextResolved: { color: colors.onSurfaceSecondary },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  actionText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  lightbox: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  lightboxImg: { width: "92%", height: "80%" },
  lightboxClose: { position: "absolute", top: 50, right: 24 },
});
