import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { classTime, classDate, stampTime, stampDate } from "@/src/datetime";

type ReceiptItem = {
  booking_id: string;
  receipt_number: string;
  class_name: string;
  trainer?: string;
  class_start?: string;
  by_appointment?: boolean;
  amount_cents: number;
  currency: string;
  paid_at?: string;
};

function fmtPaid(iso?: string) {
  if (!iso) return "—";
  return `${stampDate(iso, { day: "2-digit", month: "short", year: "numeric" })} · ${stampTime(iso)}`;
}
function fmtWhen(iso?: string, appt?: boolean) {
  if (appt) return "By appointment";
  if (!iso) return "—";
  return `${classDate(iso, { day: "2-digit", month: "short" })} · ${classTime(iso)}`;
}

export default function ReceiptsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myReceipts();
      setItems(r.receipts || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const total = items.reduce((s, r) => s + (r.amount_cents || 0), 0);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="receipts-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Receipts</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyTitle}>No receipts yet</Text>
              <Text style={styles.emptyText}>Your paid class bookings will show here with the date, amount and confirmation number.</Text>
              <Pressable testID="receipts-browse" style={styles.browseBtn} onPress={() => router.replace("/(tabs)/timetable")}>
                <Text style={styles.browseBtnText}>Browse classes</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.summaryCard}>
                <View>
                  <Text style={styles.summaryLabel}>TOTAL PAID</Text>
                  <Text style={styles.summaryAmount}>${(total / 100).toFixed(2)}</Text>
                </View>
                <View style={styles.summaryPill}>
                  <Text style={styles.summaryPillText}>{items.length} receipt{items.length === 1 ? "" : "s"}</Text>
                </View>
              </View>

              {items.map((r) => (
                <Pressable
                  key={r.booking_id}
                  testID={`receipt-item-${r.booking_id}`}
                  style={styles.card}
                  onPress={() => router.push({ pathname: "/receipt", params: { booking_id: r.booking_id } })}
                >
                  <View style={styles.iconWrap}>
                    <Ionicons name="receipt" size={20} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className} numberOfLines={1}>{r.class_name}</Text>
                    <Text style={styles.meta}>Paid {fmtPaid(r.paid_at)}</Text>
                    <Text style={styles.metaSub}>Class: {fmtWhen(r.class_start, r.by_appointment)}</Text>
                    <View style={styles.confRow}>
                      <Ionicons name="pricetag-outline" size={12} color={colors.onSurfaceSecondary} />
                      <Text style={styles.conf}>#{r.receipt_number}</Text>
                    </View>
                  </View>
                  <View style={styles.right}>
                    <Text style={styles.amount}>${(r.amount_cents / 100).toFixed(2)}</Text>
                    <Text style={styles.cur}>{r.currency}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceSecondary} style={{ marginTop: 4 }} />
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  content: { padding: spacing.lg, paddingBottom: 40 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  browseBtn: { backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.lg },
  browseBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  summaryCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  summaryLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  summaryAmount: { color: colors.onSurface, fontSize: 26, fontWeight: "900", marginTop: 2 },
  summaryPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  summaryPillText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  iconWrap: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  className: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  meta: { color: colors.onSurface, fontSize: 12, marginTop: 3 },
  metaSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  confRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  conf: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  right: { alignItems: "flex-end" },
  amount: { color: colors.brand, fontSize: 16, fontWeight: "900" },
  cur: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
});
