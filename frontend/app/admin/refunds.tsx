import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Refund = {
  booking_id: string;
  class_name: string;
  member_name: string;
  member_email?: string;
  amount_cents: number;
  currency: string;
  refund_status: "pending" | "credited" | "refunded" | "pass_returned";
  paid_with_pass?: boolean;
  flagged_at?: string;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "OWED", color: colors.warning },
  credited: { label: "CREDITED", color: colors.success },
  refunded: { label: "REFUNDED", color: colors.info },
  pass_returned: { label: "PASS RETURNED", color: "#22C55E" },
};

export default function AdminRefunds() {
  const router = useRouter();
  const [rows, setRows] = useState<Refund[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminRefunds();
      setRows(r.refunds || []);
      setPendingTotal(r.pending_total_cents || 0);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resolve = async (booking_id: string, method: "credit" | "refunded" | "class_pass") => {
    setBusy(booking_id + method);
    try {
      await api.adminResolveRefund(booking_id, method);
      setToast(
        method === "credit" ? "Credit added to member's account." :
        method === "class_pass" ? "Class pass returned — member notified." :
        "Marked as refunded — member notified."
      );
      await load();
    } catch (e: any) {
      setToast(e?.message || "Could not update");
    }
    setBusy(null);
  };

  const pending = rows.filter((r) => r.refund_status === "pending");
  const resolved = rows.filter((r) => r.refund_status !== "pending");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="refunds-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Refunds & Credits</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }}>
          <View style={styles.summary}>
            <View>
              <Text style={styles.summaryLabel}>OWED TO MEMBERS</Text>
              <Text style={styles.summaryAmount}>${(pendingTotal / 100).toFixed(2)}</Text>
            </View>
            <View style={styles.summaryPill}>
              <Text style={styles.summaryPillText}>{pending.length} pending</Text>
            </View>
          </View>

          {rows.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyTitle}>No refunds owed</Text>
              <Text style={styles.emptyText}>When you cancel a class, paid members show up here so you can credit or refund them.</Text>
            </View>
          )}

          {pending.map((r) => (
            <View key={r.booking_id} testID={`refund-${r.booking_id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.member}>{r.member_name}</Text>
                  <Text style={styles.meta}>{r.class_name}</Text>
                  {!!r.member_email && <Text style={styles.metaSub}>{r.member_email}</Text>}
                </View>
                <View style={styles.amountBox}>
                  {r.paid_with_pass ? (
                    <>
                      <Ionicons name="ticket" size={18} color="#22C55E" />
                      <Text style={[styles.cur, { color: "#22C55E", fontWeight: "800" }]}>1 CLASS PASS</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.amount}>${(r.amount_cents / 100).toFixed(2)}</Text>
                      <Text style={styles.cur}>{r.currency}</Text>
                    </>
                  )}
                </View>
              </View>
              {r.paid_with_pass ? (
                <View style={styles.actions}>
                  <Pressable
                    testID={`refund-pass-${r.booking_id}`}
                    style={styles.passBtn}
                    onPress={() => resolve(r.booking_id, "class_pass")}
                    disabled={!!busy}
                  >
                    {busy === r.booking_id + "class_pass" ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <Ionicons name="ticket" size={15} color="#fff" />
                        <Text style={styles.passBtnText}>Return class pass</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    testID={`refund-refunded-${r.booking_id}`}
                    style={styles.refundedBtn}
                    onPress={() => resolve(r.booking_id, "refunded")}
                    disabled={!!busy}
                  >
                    {busy === r.booking_id + "refunded" ? <ActivityIndicator color={colors.onSurface} size="small" /> : (
                      <Text style={styles.refundedBtnText}>No return</Text>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    testID={`refund-credit-${r.booking_id}`}
                    style={styles.creditBtn}
                    onPress={() => resolve(r.booking_id, "credit")}
                    disabled={!!busy}
                  >
                    {busy === r.booking_id + "credit" ? <ActivityIndicator color={colors.onBrand} size="small" /> : (
                      <>
                        <Ionicons name="wallet" size={15} color={colors.onBrand} />
                        <Text style={styles.creditBtnText}>Give ${(r.amount_cents / 100).toFixed(0)} credit</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    testID={`refund-refunded-${r.booking_id}`}
                    style={styles.refundedBtn}
                    onPress={() => resolve(r.booking_id, "refunded")}
                    disabled={!!busy}
                  >
                    {busy === r.booking_id + "refunded" ? <ActivityIndicator color={colors.onSurface} size="small" /> : (
                      <Text style={styles.refundedBtnText}>Mark refunded</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          ))}

          {resolved.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>RESOLVED</Text>
              {resolved.map((r) => {
                const m = STATUS_META[r.refund_status];
                return (
                  <View key={r.booking_id} style={[styles.card, { opacity: 0.75 }]}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.member}>{r.member_name}</Text>
                        <Text style={styles.meta}>{r.class_name}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        {r.paid_with_pass ? (
                          <Text style={styles.amount}>1 pass</Text>
                        ) : (
                          <Text style={styles.amount}>${(r.amount_cents / 100).toFixed(2)}</Text>
                        )}
                        <View style={[styles.statusPill, { backgroundColor: m.color }]}>
                          <Text style={styles.statusText}>{m.label}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {toast && (
        <Pressable testID="refunds-toast" style={styles.toast} onPress={() => setToast(null)}>
          <Ionicons name="checkmark-circle" size={16} color={colors.onBrand} />
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  summaryLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  summaryAmount: { color: colors.onSurface, fontSize: 26, fontWeight: "900", marginTop: 2 },
  summaryPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  summaryPillText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 50, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  member: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  metaSub: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 1, opacity: 0.8 },
  amountBox: { alignItems: "flex-end" },
  amount: { color: colors.brand, fontSize: 17, fontWeight: "900" },
  cur: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  creditBtn: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 11, borderRadius: radius.md },
  creditBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 },
  passBtn: { flex: 1.5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#22C55E", paddingVertical: 11, borderRadius: radius.md },
  passBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  refundedBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  refundedBtnText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },
  sectionLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.lg, marginBottom: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  toast: { position: "absolute", left: spacing.lg, right: spacing.lg, bottom: 24, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.md },
  toastText: { color: colors.onBrand, fontSize: 13, fontWeight: "700", flex: 1 },
});
