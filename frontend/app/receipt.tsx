import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, stampTime, stampDate } from "@/src/datetime";

type Receipt = {
  booking_id: string;
  receipt_number: string;
  booking_no?: number;
  class_name: string;
  trainer?: string;
  class_start?: string;
  by_appointment?: boolean;
  requested_time?: string;
  amount_cents: number;
  currency: string;
  paid_at?: string;
  payment_method: string;
  order_id?: string;
  member_name?: string;
  member_email?: string;
  location?: string;
  child_age?: number;
};

// "Paid on" is a real UTC instant → show in Queensland time (GMT+10).
function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  return `${stampDate(iso, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${stampTime(iso)}`;
}
// Class start time is stored as Queensland wall-clock → show as-is.
function fmtClassWhen(iso?: string) {
  if (!iso) return "—";
  return `${classDate(iso, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${classTime(iso)}`;
}

export default function ReceiptScreen() {
  const router = useRouter();
  const { booking_id } = useLocalSearchParams<{ booking_id?: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

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

  const receiptHtml = (r: Receipt) => {
    const amt = (r.amount_cents / 100).toFixed(2);
    const when = r.by_appointment ? "By appointment" : fmtClassWhen(r.class_start);
    const rows = [
      ["Class", r.class_name],
      ["Coach", r.trainer || "—"],
      ["When", when],
      ...(typeof r.child_age === "number" ? [["Child's age", `${r.child_age} years`]] : []),
      ["Booking No.", r.booking_no ? String(r.booking_no) : "—"],
      ["Paid on", fmtDateTime(r.paid_at)],
      ["Payment method", r.payment_method],
      ["Receipt #", r.receipt_number],
      ["Account", r.member_email || "—"],
    ].map(([l, v]) => `<tr><td class="l">${l}</td><td class="v">${v}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1"/>
      <style>
        *{box-sizing:border-box;font-family:-apple-system,Helvetica,Arial,sans-serif}
        body{margin:0;padding:32px;color:#141416;background:#fff}
        .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FF7A00;padding-bottom:16px}
        .brand{font-size:24px;font-weight:800}.brand span{color:#FF7A00}
        .paid{background:#DCFCE7;color:#16A34A;font-weight:800;padding:6px 12px;border-radius:20px;font-size:12px;letter-spacing:.5px}
        h1{font-size:15px;letter-spacing:2px;color:#888;margin:28px 0 4px;font-weight:700}
        .amt{font-size:42px;font-weight:800;margin:2px 0}.cur{color:#888;font-size:13px;font-weight:700;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        td{padding:11px 0;border-bottom:1px solid #eee;font-size:14px}
        td.l{color:#888;font-weight:600}td.v{text-align:right;font-weight:700}
        .foot{margin-top:26px;color:#888;font-size:12px;line-height:1.5}
      </style></head><body>
      <div class="head"><div class="brand">max<span>energy</span> fitness</div><div class="paid">PAID</div></div>
      <h1>AMOUNT PAID</h1><div class="amt">$${amt}</div><div class="cur">${r.currency}</div>
      <table>${rows}</table>
      <div class="foot">${r.location || ""}<br/>Thank you for training with Maxenergy Fitness 🥊<br/>ABN 81 213 163 833</div>
      </body></html>`;
  };

  const onShare = async () => {
    if (!receipt) return;
    setSharing(true);
    try {
      const html = receiptHtml(receipt);
      if (Platform.OS === "web") {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Share your receipt" });
        } else {
          Alert.alert("Saved", "Your receipt PDF was created.");
        }
      }
    } catch (e: any) {
      Alert.alert("Couldn't share", e?.message || "Please try again.");
    }
    setSharing(false);
  };

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

              {receipt.by_appointment && (
                <View style={styles.pendingBox}>
                  <Ionicons name="time-outline" size={16} color="#F59E0B" />
                  <Text style={styles.pendingText}>Payment received — your booking will be approved once the gym confirms your time. We'll notify you shortly.</Text>
                </View>
              )}

              <Row label="Class" value={receipt.class_name} />
              {!!receipt.trainer && <Row label="Coach" value={receipt.trainer} />}
              <Row label="When" value={receipt.by_appointment ? (receipt.requested_time || "By appointment") : fmtClassWhen(receipt.class_start)} />
              {typeof receipt.child_age === "number" && <Row label="Child's age" value={`${receipt.child_age} years`} />}
              {!!receipt.booking_no && <Row label="Booking No." value={String(receipt.booking_no)} />}
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

            <Pressable testID="receipt-share" style={styles.shareBtn} onPress={onShare} disabled={sharing}>
              {sharing ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <>
                  <Ionicons name="share-outline" size={18} color={colors.brand} />
                  <Text style={styles.shareBtnText}>{Platform.OS === "web" ? "SAVE / PRINT PDF" : "SHARE / SAVE PDF"}</Text>
                </>
              )}
            </Pressable>

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
  pendingBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "#F59E0B", borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  pendingText: { flex: 1, color: colors.onSurface, fontSize: 12.5, lineHeight: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 8, gap: spacing.lg },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700", flex: 1, textAlign: "right" },
  dashed: { borderBottomWidth: 1, borderStyle: "dashed", borderColor: colors.border, marginVertical: spacing.md },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, marginTop: spacing.xl },
  shareBtnText: { color: colors.brand, fontFamily: font.display, fontSize: 15, letterSpacing: 1 },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 16, letterSpacing: 1 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: spacing.xs },
  secondaryBtnText: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  errorBox: { alignItems: "center", marginTop: 80, gap: spacing.md },
  errorText: { color: colors.onSurfaceSecondary, fontSize: 15 },
});
