import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, BACKEND_URL } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

const QUICK = [2500, 5000, 10000, 15000];
const MIN = 1000;
const MAX = 50000;

export default function GiftCards() {
  const { refresh } = useAuth();
  const [amount, setAmount] = useState<number | null>(5000);
  const [custom, setCustom] = useState("");
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [doneCode, setDoneCode] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemOk, setRedeemOk] = useState<string | null>(null);
  const [lockLeft, setLockLeft] = useState(0);

  React.useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setInterval(() => setLockLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockLeft]);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const effectiveAmount = custom.trim() ? Math.round(parseFloat(custom) * 100) : amount;
  const amountValid = typeof effectiveAmount === "number" && !Number.isNaN(effectiveAmount) && effectiveAmount >= MIN && effectiveAmount <= MAX;
  const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const buy = async () => {
    setMsg(null); setDoneCode(null);
    if (!amountValid) { setMsg(`Please choose an amount between $${MIN / 100} and $${MAX / 100}.`); return; }
    if (!rEmail.trim() || !rEmail.includes("@")) { setMsg("Please enter the recipient's email."); return; }
    setBusy(true);
    try {
      const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : BACKEND_URL!;
      const { url, session_id } = await api.giftcardCheckout(effectiveAmount as number, origin, rName.trim(), rEmail.trim(), message.trim());
      if (Platform.OS === "web") { window.location.href = url; return; }
      await WebBrowser.openBrowserAsync(url);
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const s = await api.giftcardStatus(session_id);
          if (s.payment_status === "paid") { setBusy(false); setDoneCode(s.code || "sent"); return; }
        } catch {}
      }
      setMsg("Still processing — the gift card will be emailed once payment confirms.");
    } catch (e: any) {
      setMsg(e?.message || "Could not start checkout.");
    }
    setBusy(false);
  };

  const redeem = async () => {
    setRedeemMsg(null); setRedeemOk(null);
    if (!code.trim()) { setRedeemMsg("Enter a gift card code."); return; }
    setRedeemBusy(true);
    try {
      const r = await api.giftcardRedeem(code.trim().toUpperCase());
      setRedeemOk(`${money(r.amount_cents)} added to your account credit! New balance: ${money(r.credit_cents)}.`);
      setCode("");
      refresh();
    } catch (e: any) {
      if (e?.status === 429 && e?.retryAfter) setLockLeft(e.retryAfter);
      setRedeemMsg(e?.message || "Could not redeem that code.");
    }
    setRedeemBusy(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Gift Cards" backTestID="gift-back" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Ionicons name="gift" size={30} color={colors.onBrand} />
            <Text style={styles.heroTitle}>Give the gift of training</Text>
            <Text style={styles.heroSub}>Send a Maxenergy Fitness gift card — they'll get a code to redeem in-app or use in-store.</Text>
          </View>

          {doneCode ? (
            <View style={styles.successCard}>
              <Ionicons name="checkmark-circle" size={40} color="#22C55E" />
              <Text style={styles.successTitle}>Gift card sent! 🎁</Text>
              <Text style={styles.successSub}>We've emailed {rEmail || "the recipient"} their gift card code. A copy of your confirmation is on its way too.</Text>
              {doneCode !== "sent" && (
                <View style={styles.codeBox}><Text style={styles.codeText}>{doneCode}</Text></View>
              )}
              <Pressable testID="gift-done" style={styles.primaryBtn} onPress={() => { setDoneCode(null); setCustom(""); setRName(""); setREmail(""); setMessage(""); }}>
                <Text style={styles.primaryBtnText}>SEND ANOTHER</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Choose an amount</Text>
              <View style={styles.quickRow}>
                {QUICK.map((c) => {
                  const active = !custom.trim() && amount === c;
                  return (
                    <Pressable key={c} testID={`gift-amt-${c}`} style={[styles.quickChip, active && styles.quickChipActive]} onPress={() => { setAmount(c); setCustom(""); }}>
                      <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{money(c)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.orText}>or enter a custom amount</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  testID="gift-custom-amount"
                  style={styles.amountInput}
                  placeholder="0"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  keyboardType="decimal-pad"
                  value={custom}
                  onChangeText={(t) => setCustom(t.replace(/[^0-9.]/g, ""))}
                />
              </View>
              <Text style={styles.hint}>Between ${MIN / 100} and ${MAX / 100}</Text>

              <View style={styles.divider} />
              <Text style={styles.label}>Recipient</Text>
              <TextInput testID="gift-rname" style={styles.input} placeholder="Recipient name" placeholderTextColor={colors.onSurfaceSecondary} value={rName} onChangeText={setRName} />
              <TextInput testID="gift-remail" style={styles.input} placeholder="Recipient email" placeholderTextColor={colors.onSurfaceSecondary} autoCapitalize="none" keyboardType="email-address" value={rEmail} onChangeText={setREmail} />
              <TextInput testID="gift-message" style={[styles.input, styles.messageInput]} placeholder="Add a personal message (optional)" placeholderTextColor={colors.onSurfaceSecondary} value={message} onChangeText={setMessage} multiline maxLength={300} />

              {msg && <Text style={styles.errText}>{msg}</Text>}

              <Pressable testID="gift-buy" style={[styles.primaryBtn, (!amountValid || busy) && { opacity: 0.6 }]} onPress={buy} disabled={busy}>
                {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                  <>
                    <Ionicons name="card" size={18} color={colors.onBrand} />
                    <Text style={styles.primaryBtnText}>PAY {amountValid ? money(effectiveAmount as number) : ""} & SEND</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* Redeem */}
          <View style={styles.card}>
            <Text style={styles.label}>Have a gift card?</Text>
            <Text style={styles.redeemSub}>Enter your code to add the balance to your account credit.</Text>
            <TextInput testID="gift-redeem-code" style={[styles.input, { letterSpacing: 1.5, textTransform: "uppercase" }]} placeholder="MEG-XXXX-XXXX" placeholderTextColor={colors.onSurfaceSecondary} autoCapitalize="characters" value={code} onChangeText={setCode} editable={lockLeft <= 0} />
            {lockLeft > 0 && (
              <View style={styles.lockBox}>
                <Ionicons name="lock-closed" size={16} color="#F59E0B" />
                <Text style={styles.lockText}>Too many wrong tries. Try again in <Text style={styles.lockTimer}>{mmss(lockLeft)}</Text></Text>
              </View>
            )}
            {redeemMsg && lockLeft <= 0 && <Text style={styles.errText}>{redeemMsg}</Text>}
            {redeemOk && <Text style={styles.okText}>{redeemOk}</Text>}
            <Pressable testID="gift-redeem-btn" style={[styles.outlineBtn, (redeemBusy || lockLeft > 0) && { opacity: 0.6 }]} onPress={redeem} disabled={redeemBusy || lockLeft > 0}>
              {redeemBusy ? <ActivityIndicator color={colors.brand} /> : (
                <>
                  <Ionicons name={lockLeft > 0 ? "time" : "pricetag"} size={17} color={colors.brand} />
                  <Text style={styles.outlineBtnText}>{lockLeft > 0 ? `LOCKED · ${mmss(lockLeft)}` : "REDEEM CODE"}</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.lg, gap: 6 },
  heroTitle: { color: colors.onBrand, fontSize: 20, fontFamily: font.display },
  heroSub: { color: colors.onBrand, fontSize: 13.5, lineHeight: 19, opacity: 0.95 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  label: { color: colors.onSurface, fontSize: 15, fontFamily: font.heading },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  quickChip: { flex: 1, minWidth: "22%", alignItems: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1.5, borderColor: colors.border },
  quickChipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brand },
  quickChipText: { color: colors.onSurface, fontWeight: "900", fontSize: 15 },
  quickChipTextActive: { color: colors.brand },
  orText: { color: colors.onSurfaceSecondary, fontSize: 12.5, textAlign: "center" },
  amountInputRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: spacing.md },
  dollar: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  amountInput: { flex: 1, color: colors.onSurface, fontSize: 22, fontWeight: "900", paddingVertical: 12, paddingHorizontal: 6 },
  hint: { color: colors.onSurfaceSecondary, fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  input: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 12 },
  messageInput: { height: 80, textAlignVertical: "top" },
  errText: { color: colors.error, fontSize: 13, lineHeight: 18 },
  okText: { color: "#22C55E", fontSize: 13.5, lineHeight: 19, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 15, borderRadius: radius.md, marginTop: spacing.xs },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 0.6 },
  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.xs },
  outlineBtnText: { color: colors.brand, fontFamily: font.display, fontSize: 14, letterSpacing: 0.5 },
  redeemSub: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, marginTop: -4 },
  lockBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 },
  lockText: { color: "#F59E0B", fontSize: 13, flex: 1 },
  lockTimer: { fontWeight: "900" },
  successCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: "#22C55E55", padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  successTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.display },
  successSub: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, textAlign: "center" },
  codeBox: { alignSelf: "stretch", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", borderRadius: radius.md, paddingVertical: 16, alignItems: "center", marginTop: spacing.sm },
  codeText: { color: colors.brand, fontSize: 20, fontWeight: "900", letterSpacing: 2 },
});
