import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { SignatureView } from "@/src/components/SignaturePad";

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

  const load = useCallback(async () => {
    try {
      const r = await api.adminApplications();
      setApps(r.applications || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (id: string, status: string) => {
    try {
      await api.adminSetApplicationStatus(id, status);
      setApps((a) => a.map((x) => (x.application_id === id ? { ...x, status } : x)));
    } catch {}
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
      <View style={styles.header}>
        <Pressable testID="adminapp-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Applications</Text>
        <Pressable testID="adminapp-log" hitSlop={12} onPress={() => router.push("/admin/membership-log")} style={styles.logBtn}>
          <Ionicons name="time-outline" size={15} color={colors.brand} />
          <Text style={styles.logBtnText}>Log</Text>
        </Pressable>
      </View>

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

                {open && !!a.has_pdf && (
                  <Pressable
                    testID={`adminapp-pdf-${a.application_id}`}
                    style={styles.pdfBtn}
                    onPress={async () => {
                      try {
                        const { url } = await api.membershipFormUrl(a.application_id);
                        if (Platform.OS === "web") {
                          Linking.openURL(url).catch(() => {});
                        } else {
                          WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => {}));
                        }
                      } catch {}
                    }}
                  >
                    <Ionicons name="document-text" size={16} color={colors.brand} />
                    <Text style={styles.pdfBtnText}>{Platform.OS === "web" ? "Open membership PDF" : "View membership PDF"}</Text>
                  </Pressable>
                )}

                <View style={styles.actions}>
                  <Pressable
                    testID={`adminapp-approve-${a.application_id}`}
                    style={[styles.actBtn, { backgroundColor: colors.brand }]}
                    onPress={() => setStatus(a.application_id, "approved")}
                  >
                    <Ionicons name="checkmark" size={16} color={colors.onBrand} />
                    <Text style={[styles.actText, { color: colors.onBrand }]}>Approve</Text>
                  </Pressable>
                  <Pressable
                    testID={`adminapp-decline-${a.application_id}`}
                    style={[styles.actBtn, { backgroundColor: colors.surfaceTertiary }]}
                    onPress={() => setStatus(a.application_id, "declined")}
                  >
                    <Ionicons name="close" size={16} color={colors.error} />
                    <Text style={[styles.actText, { color: colors.error }]}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
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
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
});
