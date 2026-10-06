import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { SignatureView } from "@/src/components/SignaturePad";
import ScreenHeader from "@/src/components/ScreenHeader";

type App = {
  application_id: string;
  full_name: string;
  email: string;
  phone: string;
  plan_name: string;
  category: string;
  status: string;
  created_at: string;
  details?: any;
  has_pdf?: boolean;
  pdf_filename?: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: colors.warning,
  approved: colors.success,
  declined: colors.error,
};

export default function AdminApplications() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ app: App; status: string } | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminApplications();
      setApps(r.applications || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPdf = async (id: string) => {
    try {
      const { url } = await api.membershipFormUrl(id);
      if (Platform.OS === "web") Linking.openURL(url).catch(() => {});
      else WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
    } catch {}
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await api.adminSetApplicationStatus(id, status);
      setApps((a) => a.map((x) => (x.application_id === id ? { ...x, status } : x)));
    } catch {}
  };

  const doConfirm = async () => {
    if (!confirm) return;
    setActing(true);
    await setStatus(confirm.app.application_id, confirm.status);
    setActing(false);
    setConfirm(null);
  };

  const renderDetails = (d: any) => {
    if (!d) return null;
    const med = d.medical || {};
    const flags: string[] = [];
    ["medications", "conditions"].forEach((g) => {
      const obj = med[g] || {};
      Object.keys(obj).forEach((k) => obj[k] && flags.push(k));
    });
    const rows: [string, string][] = [
      ["Type", d.membership_type],
      ["Term", d.term],
      ["DOB", d.dob],
      ["Address", [d.address, d.suburb, d.postcode].filter(Boolean).join(", ")],
      ["Emergency", [d.emergency_name, d.emergency_phone].filter(Boolean).join(" · ")],
      ["How found", d.how_found],
      ["Medical flags", flags.join(", ") || "None"],
      ["Media consent", d.media_consent ? "Yes" : "No"],
      ["Waiver", d.waiver_agreed ? "Signed" : "Not signed"],
      ["Signature", d.signature],
    ];
    return (
      <View style={styles.details}>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <Text key={k} style={styles.detailRow}>
            <Text style={styles.detailKey}>{k}: </Text>
            {v}
          </Text>
        ))}
        {!!d.photo_base64 && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.detailKey}>Photo</Text>
            <Image source={d.photo_base64} style={styles.photo} contentFit="cover" />
          </View>
        )}
        {!!d.signature_path && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.detailKey}>Signature</Text>
            <SignatureView d={d.signature_path} height={90} />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Applications"
        backTestID="adminapp-back"
        fallback="/admin"
        right={
          <Pressable testID="adminapp-log" hitSlop={12} onPress={() => router.push("/admin/membership-log")} style={styles.logBtn}>
            <Ionicons name="time-outline" size={15} color={colors.brand} />
            <Text style={styles.logBtnText}>Log</Text>
          </Pressable>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {apps.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No applications yet.</Text>
            </View>
          )}
          {apps.map((a) => {
            const open = expanded === a.application_id;
            return (
              <View key={a.application_id} testID={`adminapp-${a.application_id}`} style={styles.card}>
                <Pressable style={styles.cardTop} onPress={() => setExpanded(open ? null : a.application_id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{a.full_name}</Text>
                    <Text style={styles.meta}>{a.plan_name} · {a.category}</Text>
                    <Text style={styles.meta}>{a.email} · {a.phone}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: (STATUS_COLORS[a.status] || colors.info) + "22" }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[a.status] || colors.info }]}>{a.status.toUpperCase()}</Text>
                  </View>
                </Pressable>

                {open && renderDetails(a.details)}

                {!!a.has_pdf && (
                  <Pressable
                    testID={`adminapp-pdf-${a.application_id}`}
                    style={styles.pdfBtn}
                    onPress={() => openPdf(a.application_id)}
                  >
                    <Ionicons name="document-attach" size={16} color={colors.brand} />
                    <Text style={styles.pdfBtnText}>{Platform.OS === "web" ? "Open membership form (PDF)" : "View membership form (PDF)"}</Text>
                  </Pressable>
                )}

                {a.status === "pending" ? (
                  <View style={styles.actions}>
                    <Pressable
                      testID={`adminapp-approve-${a.application_id}`}
                      style={[styles.actBtn, { backgroundColor: colors.brand }]}
                      onPress={() => setConfirm({ app: a, status: "approved" })}
                    >
                      <Ionicons name="checkmark" size={16} color={colors.onBrand} />
                      <Text style={[styles.actText, { color: colors.onBrand }]}>Approve</Text>
                    </Pressable>
                    <Pressable
                      testID={`adminapp-decline-${a.application_id}`}
                      style={[styles.actBtn, { backgroundColor: colors.surfaceTertiary }]}
                      onPress={() => setConfirm({ app: a, status: "declined" })}
                    >
                      <Ionicons name="close" size={16} color={colors.error} />
                      <Text style={[styles.actText, { color: colors.error }]}>Decline</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.resultBar,
                      {
                        backgroundColor: (STATUS_COLORS[a.status] || colors.info) + "1A",
                        borderColor: STATUS_COLORS[a.status] || colors.info,
                      },
                    ]}
                  >
                    <Ionicons
                      name={a.status === "approved" ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={STATUS_COLORS[a.status] || colors.info}
                    />
                    <Text style={[styles.resultText, { color: STATUS_COLORS[a.status] || colors.info }]}>
                      {a.status === "approved" ? "Approved" : "Declined"}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => !acting && setConfirm(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {confirm && (
              <>
                <View style={[styles.modalIcon, { backgroundColor: (confirm.status === "approved" ? colors.success : colors.error) + "22" }]}>
                  <Ionicons
                    name={confirm.status === "approved" ? "checkmark-circle" : "close-circle"}
                    size={30}
                    color={confirm.status === "approved" ? colors.success : colors.error}
                  />
                </View>
                <Text style={styles.modalTitle}>
                  {confirm.status === "approved" ? "Approve this membership?" : "Decline this application?"}
                </Text>
                <Text style={styles.modalName}>{confirm.app.full_name}</Text>
                <Text style={styles.modalBody}>
                  {confirm.status === "approved"
                    ? "Please review their membership form before approving. The member will be notified and welcomed to the gym."
                    : "The member will be notified that their application was not approved."}
                </Text>

                {!!confirm.app.has_pdf && (
                  <Pressable testID="adminapp-confirm-pdf" style={styles.modalPdfBtn} onPress={() => openPdf(confirm.app.application_id)}>
                    <Ionicons name="document-attach" size={16} color={colors.brand} />
                    <Text style={styles.modalPdfText}>Review membership form (PDF)</Text>
                  </Pressable>
                )}

                <View style={styles.modalActions}>
                  <Pressable testID="adminapp-confirm-cancel" style={[styles.modalBtn, styles.modalCancel]} onPress={() => !acting && setConfirm(null)} disabled={acting}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="adminapp-confirm-yes"
                    style={[styles.modalBtn, { backgroundColor: confirm.status === "approved" ? colors.brand : colors.error }]}
                    onPress={doConfirm}
                    disabled={acting}
                  >
                    {acting ? (
                      <ActivityIndicator color={colors.onBrand} />
                    ) : (
                      <>
                        <Ionicons name={confirm.status === "approved" ? "checkmark" : "close"} size={16} color={confirm.status === "approved" ? colors.onBrand : "#fff"} />
                        <Text style={[styles.modalConfirmText, { color: confirm.status === "approved" ? colors.onBrand : "#fff" }]}>
                          {confirm.status === "approved" ? "Confirm approval" : "Confirm decline"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logBtnText: { color: colors.brand, fontSize: 12.5, fontWeight: "800" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  name: { color: colors.onSurface, fontWeight: "800", fontSize: 16 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  details: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  detailRow: { color: colors.onSurfaceSecondary, fontSize: 13 },
  detailKey: { color: colors.onSurface, fontWeight: "700" },
  photo: { width: 120, height: 120, borderRadius: radius.md, marginTop: 6, borderWidth: 1, borderColor: colors.border },
  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.brand },
  pdfBtnText: { color: colors.brand, fontWeight: "800", fontSize: 14 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md },
  actText: { fontWeight: "800", fontSize: 14 },
  resultBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1.5, marginTop: spacing.md },
  resultText: { fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center" },
  modalIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900", textAlign: "center" },
  modalName: { color: colors.brand, fontSize: 15, fontWeight: "800", marginTop: 4, textAlign: "center" },
  modalBody: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 20, textAlign: "center", marginTop: spacing.sm },
  modalPdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, alignSelf: "stretch", marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.brand },
  modalPdfText: { color: colors.brand, fontWeight: "800", fontSize: 14 },
  modalActions: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.lg },
  modalBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.md },
  modalCancel: { borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  modalConfirmText: { fontWeight: "900", fontSize: 14 },
});
