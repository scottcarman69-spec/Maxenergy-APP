import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { stampDate, stampTime } from "@/src/datetime";

type Entry = { ledger_id: string; delta_cents: number; reason: string; created_at: string };
type PassEntry = { pass_ledger_id: string; delta: number; reason: string; created_at: string };

export default function CreditsScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [passCredits, setPassCredits] = useState(0);
  const [passEntries, setPassEntries] = useState<PassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myCredits();
      setBalance(r.balance_cents || 0);
      setEntries(r.entries || []);
      setPassCredits(r.class_pass_credits || 0);
      setPassEntries(r.pass_entries || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const showQr = async () => {
    setQrLoading(true);
    try {
      const r = await api.classPassQr();
      setQr(r.code);
    } catch {}
    setQrLoading(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="credits-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>My Wallet</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <View style={styles.balanceCard}>
            <Ionicons name="wallet" size={26} color={colors.brand} />
            <Text style={styles.balanceLabel}>AVAILABLE CREDIT</Text>
            <Text style={styles.balanceAmount}>${(balance / 100).toFixed(2)}</Text>
            <Text style={styles.balanceHint}>Use it when you book a class — it's applied before your card.</Text>
          </View>

          {/* Class Pass Credits — a separate currency */}
          <View style={styles.passCard}>
            <View style={styles.passTop}>
              <View style={styles.passIcon}>
                <Ionicons name="ticket" size={22} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.passLabel}>CLASS PASS CREDITS</Text>
                <Text style={styles.passCount}>
                  {passCredits} <Text style={styles.passCountUnit}>pass{passCredits === 1 ? "" : "es"}</Text>
                </Text>
              </View>
            </View>
            {passCredits > 0 ? (
              <>
                <Pressable testID="show-pass-qr" style={styles.passBtn} onPress={showQr} disabled={qrLoading}>
                  {qrLoading ? <ActivityIndicator color={colors.onBrand} /> : (
                    <>
                      <Ionicons name="qr-code" size={18} color={colors.onBrand} />
                      <Text style={styles.passBtnText}>SHOW MY CLASS PASS QR</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.passHint}>Show this to gym staff on arrival — they'll scan it to check you in and use one pass. Passes never expire — they're only used when you check in.</Text>
              </>
            ) : (
              <>
                <Pressable testID="buy-pass" style={styles.passBtnOutline} onPress={() => router.push("/memberships")}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
                  <Text style={styles.passBtnOutlineText}>BUY CLASS PASSES</Text>
                </Pressable>
                <Text style={styles.passHint}>Buy a Single or 10 Class Pass to check in at the gym with your QR code. Passes never expire.</Text>
              </>
            )}
          </View>

          {passEntries.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>CLASS PASS HISTORY</Text>
              {passEntries.map((e) => {
                const earned = e.delta >= 0;
                return (
                  <View key={e.pass_ledger_id} testID={`pass-${e.pass_ledger_id}`} style={styles.row}>
                    <View style={[styles.rowIcon, { backgroundColor: earned ? "rgba(34,197,94,0.15)" : colors.brandTertiary }]}>
                      <Ionicons name={earned ? "add" : "remove"} size={16} color={earned ? "#22C55E" : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reason} numberOfLines={2}>{e.reason}</Text>
                      <Text style={styles.date}>{stampDate(e.created_at, { day: "2-digit", month: "short", year: "numeric" })} · {stampTime(e.created_at)}</Text>
                    </View>
                    <Text style={[styles.delta, { color: earned ? "#22C55E" : colors.onSurface }]}>
                      {earned ? "+" : "−"}{Math.abs(e.delta)}
                    </Text>
                  </View>
                );
              })}
            </>
          )}

          <Text style={styles.sectionLabel}>CREDIT HISTORY</Text>
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={30} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No credit activity yet. Credits from cancelled classes will show here.</Text>
            </View>
          ) : (
            entries.map((e) => {
              const earned = e.delta_cents >= 0;
              return (
                <View key={e.ledger_id} testID={`credit-${e.ledger_id}`} style={styles.row}>
                  <View style={[styles.rowIcon, { backgroundColor: earned ? "rgba(34,197,94,0.15)" : colors.brandTertiary }]}>
                    <Ionicons name={earned ? "arrow-down" : "arrow-up"} size={16} color={earned ? "#22C55E" : colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reason} numberOfLines={2}>{e.reason}</Text>
                    <Text style={styles.date}>{stampDate(e.created_at, { day: "2-digit", month: "short", year: "numeric" })} · {stampTime(e.created_at)}</Text>
                  </View>
                  <Text style={[styles.delta, { color: earned ? "#22C55E" : colors.onSurface }]}>
                    {earned ? "+" : "−"}${Math.abs(e.delta_cents / 100).toFixed(2)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <Modal visible={!!qr} transparent animationType="fade" onRequestClose={() => setQr(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQr(null)}>
          <Pressable style={styles.qrCard} onPress={() => {}}>
            <View style={styles.qrHeaderIcon}><Ionicons name="ticket" size={22} color="#22C55E" /></View>
            <Text style={styles.qrTitle}>Class Pass Entry</Text>
            <Text style={styles.qrSub}>Show this to gym staff to check in</Text>
            <View style={styles.qrBox}>
              {qr ? <QRCode value={qr} size={220} backgroundColor="#fff" color="#000" /> : null}
            </View>
            <View style={styles.qrHint}>
              <Ionicons name="information-circle-outline" size={15} color={colors.onSurfaceSecondary} />
              <Text style={styles.qrHintText}>One pass is used each time staff scan this. Keep your screen bright.</Text>
            </View>
            <Pressable testID="pass-qr-close" style={styles.qrCloseBtn} onPress={() => setQr(null)}>
              <Text style={styles.qrCloseText}>DONE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  content: { padding: spacing.lg, paddingBottom: 40 },
  balanceCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: 4 },
  balanceLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.sm },
  balanceAmount: { color: colors.brand, fontSize: 40, fontWeight: "900" },
  balanceHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 18 },
  passCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: "rgba(34,197,94,0.35)", borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md },
  passTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  passIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(34,197,94,0.15)", alignItems: "center", justifyContent: "center" },
  passLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  passCount: { color: colors.onSurface, fontSize: 30, fontWeight: "900", marginTop: 2 },
  passCountUnit: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  passBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22C55E", paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.lg },
  passBtnText: { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  passBtnOutline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.lg },
  passBtnOutlineText: { color: colors.brand, fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  passHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.md, lineHeight: 17 },
  sectionLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: 40 },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  reason: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  date: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  delta: { fontSize: 16, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  qrCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.border, width: "100%", maxWidth: 340 },
  qrHeaderIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(34,197,94,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  qrTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  qrSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, marginBottom: spacing.lg },
  qrBox: { backgroundColor: "#fff", padding: spacing.lg, borderRadius: radius.md },
  qrHint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.sm },
  qrHintText: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  qrCloseBtn: { backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg, alignSelf: "stretch" },
  qrCloseText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
