import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { stampDate } from "@/src/datetime";
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
  decided_at?: string;
};

const STATUS_META: Record<string, { label: string; color: string; icon: any; note: string }> = {
  pending: {
    label: "Under review",
    color: colors.warning,
    icon: "time",
    note: "Your application is with the Maxenergy team. We'll be in touch soon.",
  },
  approved: {
    label: "Approved",
    color: colors.success,
    icon: "checkmark-circle",
    note: "You're all set — welcome to Maxenergy Fitness! You can book classes any time.",
  },
  declined: {
    label: "Not approved",
    color: colors.error,
    icon: "close-circle",
    note: "This application wasn't approved. Please contact the gym if you'd like to discuss it.",
  },
};

export default function MyApplication() {
  const router = useRouter();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.myApplications();
      setApps(r.applications || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPdf = async (id: string) => {
    setOpening(id);
    try {
      const { url } = await api.membershipFormUrl(id);
      if (Platform.OS === "web") Linking.openURL(url);
      else await WebBrowser.openBrowserAsync(url);
    } catch {
      // PDF may not be available for older applications — silently ignore.
    }
    setOpening(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="My Membership Application" backTestID="myapp-back" fallback="/(tabs)/profile" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : apps.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons name="document-text-outline" size={30} color={colors.brand} />
          </View>
          <Text style={styles.emptyTitle}>No application yet</Text>
          <Text style={styles.emptyText}>
            Once you complete the New Membership Form, your application and its status will appear here.
          </Text>
          <Pressable testID="myapp-apply" style={styles.primaryBtn} onPress={() => router.push("/membership")}>
            <Ionicons name="create-outline" size={17} color={colors.onBrand} />
            <Text style={styles.primaryBtnText}>Complete the form</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          {apps.map((a) => {
            const meta = STATUS_META[a.status] || STATUS_META.pending;
            return (
              <View key={a.application_id} testID={`myapp-${a.application_id}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{a.plan_name || "Membership Form"}</Text>
                    <Text style={styles.submitted}>Submitted {stampDate(a.created_at, { day: "numeric", month: "long", year: "numeric" })}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: meta.color + "22", borderColor: meta.color }]}>
                    <Ionicons name={meta.icon} size={13} color={meta.color} />
                    <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <View style={[styles.noteBox, { borderColor: meta.color + "55" }]}>
                  <Ionicons name="information-circle" size={16} color={meta.color} />
                  <Text style={styles.noteText}>{meta.note}</Text>
                </View>

                <View style={styles.rows}>
                  {!!a.full_name && <Row label="Name" value={a.full_name} />}
                  {!!a.category && <Row label="Category" value={a.category} />}
                  {!!a.phone && <Row label="Phone" value={a.phone} />}
                </View>

                <Pressable
                  testID={`myapp-pdf-${a.application_id}`}
                  style={({ pressed }) => [styles.pdfBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => openPdf(a.application_id)}
                  disabled={opening === a.application_id}
                >
                  {opening === a.application_id ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : (
                    <>
                      <Ionicons name="document-text-outline" size={16} color={colors.brand} />
                      <Text style={styles.pdfBtnText}>View submitted form (PDF)</Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 13, borderRadius: radius.pill, marginTop: spacing.sm },
  primaryBtnText: { color: colors.onBrand, fontSize: 14.5, fontFamily: font.heading },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  planName: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  submitted: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 3 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  badgeText: { fontSize: 11.5, fontFamily: font.semibold, letterSpacing: 0.2, lineHeight: 13 },

  noteBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  noteText: { flex: 1, color: colors.onSurface, fontSize: 13, lineHeight: 18 },

  rows: { gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 4 },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 13 },
  rowValue: { color: colors.onSurface, fontSize: 13.5, fontFamily: font.medium, flexShrink: 1, textAlign: "right" },

  pdfBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 12 },
  pdfBtnText: { color: colors.brand, fontSize: 14, fontFamily: font.semibold },
});
