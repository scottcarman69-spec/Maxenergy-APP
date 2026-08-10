import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

type Receipt = {
  booking_id: string;
  receipt_number: string;
  class_name: string;
  trainer?: string;
  class_start?: string;
  by_appointment?: boolean;
  amount_cents: number;
  currency: string;
  paid_at?: string;
  payment_method: string;
  order_id?: string;
  member_name?: string;
  member_email?: string;
  location?: string;
};

function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function ReceiptScreen() {
  const router = useRouter();
  const { booking_id } = useLocalSearchParams<{ booking_id?: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!booking_id) { setLoading(false); setError(true); return; }
    try {
      // Small retry in case the paid-status write is a beat behind.
      let r: Receipt | null = null;
      for (let i = 0; i < 4; i++) {
        try { r = await api.paymentReceipt(String(booking_id)); break; }
        catch { await new Promise((res) => setTimeout(res, 1200)); }
      }
      if (r) setReceipt(r); else setError(true);
    } catch {
      setError(true);
    }
    setLoading(false);
  }, [booking_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const amount = receipt ? (receipt.amount_cents / 100).toFixed(2) : "0.00";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
        ) : error || !receipt ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.onSurfaceSecondary} />
            <Text style={styles.errorText}>We couldn't load this receipt.</Text>
            <Pressable testID="receipt-home" style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/profile")}>
              <Text style={styles.primaryBtnText}>GO TO MY BOOKINGS</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.successHeader}>
              <View style={styles.successCircle}>
                <Ionicons name="checkmark" size={44} color={colors.onBrand} />
              </View>
              <Text style={styles.successTitle}>Payment Successful</Text>
              <Text style={styles.successSub}>Your class is booked. A copy has been emailed to you.</Text>
            </View>

            <View testID="receipt-card" style={styles.card}>
              <View style={styles.cardHeader}>
                <Image source={require("../assets/images/maxenergy-logo.webp")} style={styles.logo} contentFit="contain" />
                <View style={styles.paidPill}>
                  <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                  <Text style={styles.paidPillText}>PAID</Text>
                </View>
              </View>

              <Text style={styles.amount}>${amount}</Text>
              <Text style={styles.amountCur}>{receipt.currency}</Text>

              <View style={styles.divider} />

              <Row label="Class" value={receipt.class_name} />
              {!!receipt.trainer && <Row label="Coach" value={receipt.trainer} />}
              <Row label="When" value={receipt.by_appointment ? "By appointment" : fmtDateTime(receipt.class_start)} />
              <Row label="Paid on" value={fmtDateTime(receipt.paid_at)} />
              <Row label="Payment method" value={receipt.payment_method} />
              <Row label="Receipt #" value={receipt.receipt_number} />
              {!!receipt.member_email && <Row label="Account" value={receipt.member_email} />}

              <View style={styles.dashed} />
              <View style={styles.footerRow}>
                <Ionicons name="location-outline" size={13} color={colors.onSurfaceSecondary} />
                <Text style={styles.footerText}>{receipt.location}</Text>
              </View>
            </View>

            <Pressable testID="receipt-done" style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/profile")}>
              <Text style={styles.primaryBtnText}>DONE</Text>
            </Pressable>
            <Pressable testID="receipt-book-more" style={styles.secondaryBtn} onPress={() => router.replace("/(tabs)/timetable")}>
              <Ionicons name="calendar-outline" size={16} color={colors.brand} />
              <Text style={styles.secondaryBtnText}>Book another class</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xl },
  successHeader: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.xl },
  successCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  successTitle: { color: colors.onSurface, fontSize: 26, fontFamily: font.display, textAlign: "center" },
  successSub: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", marginTop: spacing.xs, lineHeight: 20, paddingHorizontal: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 130, height: 42 },
  paidPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22C55E22", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  paidPillText: { color: "#22C55E", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  amount: { color: colors.onSurface, fontSize: 44, fontWeight: "900", marginTop: spacing.lg, letterSpacing: -1 },
  amountCur: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700", marginTop: -4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, gap: spacing.lg },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "right" },
  dashed: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: colors.border, marginVertical: spacing.md },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.xl },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 16, letterSpacing: 1 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: spacing.xs },
  secondaryBtnText: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  errorBox: { alignItems: "center", marginTop: 80, gap: spacing.md },
  errorText: { color: colors.onSurfaceSecondary, fontSize: 15 },
});
