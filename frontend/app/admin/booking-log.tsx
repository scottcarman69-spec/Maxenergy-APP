import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, TextInput, FlatList, Pressable, ActivityIndicator, RefreshControl, Platform, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { stampDate } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";

type LogItem = {
  log_id: string;
  reference?: string;
  member_name?: string;
  first_name?: string;
  member_email?: string;
  phone?: string;
  class_name?: string;
  when?: string;
  duration_min?: number;
  payment_method?: string;
  amount_cents?: number;
  credit_applied_cents?: number;
  membership_plan?: string;
  membership_status?: string;
  membership_expires?: string;
  key_tag?: string;
  created_at?: string;
};

const money = (c?: number) => `$${((c || 0) / 100).toFixed(2)}`;
const dollars = (c?: number) => ((c || 0) / 100).toFixed(2);

// Quote a CSV cell (escape embedded quotes, wrap if it has comma/quote/newline).
const csvCell = (v: any) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function BookingLog() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.adminBookingLog();
      setItems(r.log || []);
      setTotal(r.total_cents || 0);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((r) => {
      const hay = [r.member_name, r.first_name, r.member_email, r.reference, r.class_name, r.phone, r.payment_method, r.membership_plan]
        .map((x) => String(x || "")).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [items, q]);

  const shownTotal = useMemo(() => filtered.reduce((s, r) => s + (r.amount_cents || 0), 0), [filtered]);

  const [exporting, setExporting] = useState(false);
  const buildCsv = useCallback((rows: LogItem[]) => {
    const headers = ["Reference", "Date Logged", "Member", "Email", "Phone", "Class", "When",
      "Duration (min)", "Payment Method", "Amount (AUD)", "Credit Applied (AUD)",
      "Membership Plan", "Membership Status", "Membership Expires", "Key Tag"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        csvCell(r.reference),
        csvCell(r.created_at ? stampDate(r.created_at, { day: "numeric", month: "short", year: "numeric" }) : ""),
        csvCell(r.member_name || r.first_name || "Member"),
        csvCell(r.member_email),
        csvCell(r.phone),
        csvCell(r.class_name),
        csvCell(r.when),
        csvCell(r.duration_min ?? ""),
        csvCell(r.payment_method),
        csvCell(dollars(r.amount_cents)),
        csvCell(dollars(r.credit_applied_cents)),
        csvCell(r.membership_plan),
        csvCell(r.membership_status),
        csvCell(r.membership_expires),
        csvCell(r.key_tag),
      ].join(","));
    }
    return lines.join("\n");
  }, []);

  const exportCsv = useCallback(async () => {
    if (!filtered.length || exporting) return;
    setExporting(true);
    try {
      const csv = buildCsv(filtered);
      const fname = `maxenergy-booking-log-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fname; document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
      } else {
        const uri = FileSystem.cacheDirectory + fname;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export booking log", UTI: "public.comma-separated-values-text" });
        } else {
          Alert.alert("Export ready", `Saved ${filtered.length} rows to ${fname}.`);
        }
      }
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export the booking log.");
    }
    setExporting(false);
  }, [filtered, exporting, buildCsv]);

  const renderItem = ({ item }: { item: LogItem }) => (
    <View style={styles.card} testID={`blog-${item.log_id}`}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>{item.member_name || item.first_name || "Member"}</Text>
        <Text style={styles.amount}>{money(item.amount_cents)}</Text>
      </View>
      <View style={styles.refRow}>
        <Ionicons name="pricetag-outline" size={13} color={colors.brand} />
        <Text style={styles.ref}>{item.reference || "—"}</Text>
      </View>
      <Text style={styles.cls} numberOfLines={1}>{item.class_name}{item.when ? `  ·  ${item.when}` : ""}</Text>
      <View style={styles.metaRow}>
        <View style={styles.payPill}>
          <Ionicons name="card-outline" size={12} color={colors.onSurfaceSecondary} />
          <Text style={styles.payText} numberOfLines={1}>{item.payment_method || "—"}</Text>
        </View>
        {!!item.credit_applied_cents && item.credit_applied_cents > 0 && (
          <View style={[styles.payPill, { borderColor: "#22C55E" }]}>
            <Text style={[styles.payText, { color: "#22C55E" }]}>{money(item.credit_applied_cents)} credit</Text>
          </View>
        )}
        {!!item.created_at && <Text style={styles.date}>{stampDate(item.created_at, { day: "numeric", month: "short", year: "numeric" })}</Text>}
      </View>
      {(!!item.phone || !!item.member_email) && (
        <Text style={styles.contact} numberOfLines={1}>{item.phone || ""}{item.phone && item.member_email ? "  ·  " : ""}{item.member_email || ""}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Booking Log" backTestID="blog-back" fallback="/admin" />
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="blog-search"
          value={q}
          onChangeText={setQ}
          placeholder="Search name, reference, class, payment…"
          placeholderTextColor={colors.onSurfaceSecondary}
          style={styles.search}
          autoCapitalize="none"
        />
        {q.length > 0 && (
          <Pressable testID="blog-clear" hitSlop={8} onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
      </View>

      <Pressable
        testID="blog-export"
        style={[styles.exportBtn, (!filtered.length || exporting) && { opacity: 0.5 }]}
        onPress={exportCsv}
        disabled={!filtered.length || exporting}
      >
        {exporting ? (
          <ActivityIndicator color={colors.onBrand} size="small" />
        ) : (
          <>
            <Ionicons name="download-outline" size={17} color={colors.onBrand} />
            <Text style={styles.exportText}>Export {q.trim() ? "results" : "all"} to spreadsheet (CSV){filtered.length ? ` · ${filtered.length}` : ""}</Text>
          </>
        )}
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.log_id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{filtered.length} booking{filtered.length === 1 ? "" : "s"}</Text>
              <Text style={styles.summaryTotal}>{money(q.trim() ? shownTotal : total)}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>{q.trim() ? "No bookings match your search." : "No paid bookings yet."}</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, height: 46 },
  search: { flex: 1, color: colors.onSurface, fontSize: 15 },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.lg, height: 46 },
  exportText: { color: colors.onBrand, fontSize: 13.5, fontWeight: "900", letterSpacing: 0.3 },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  summaryText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5 },
  summaryTotal: { color: colors.brand, fontSize: 15, fontWeight: "900" },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 5 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  name: { flex: 1, color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  amount: { color: colors.onSurface, fontSize: 15, fontWeight: "900" },
  refRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  ref: { color: colors.brand, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5 },
  cls: { color: colors.onSurface, fontSize: 13.5 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2, flexWrap: "wrap" },
  payPill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  payText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "700" },
  date: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginLeft: "auto" },
  contact: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
});
