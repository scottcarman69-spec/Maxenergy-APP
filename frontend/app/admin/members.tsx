import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Linking, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { stampDate } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";

type Member = {
  user_id: string;
  name?: string;
  email?: string;
  is_admin?: boolean;
  provider?: string;
  created_at?: string;
  trials?: string[];
  is_member?: boolean;
  application_status?: string | null;
  active_bookings?: number;
  phone?: string;
  credit_cents?: number;
};

const FILTERS = ["All", "Members", "Free Trials"] as const;

function fmtDate(iso?: string) {
  if (!iso) return "";
  return stampDate(iso, { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminMembers() {
  const router = useRouter();
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [totals, setTotals] = useState<{ total: number; trial_claims: number }>({ total: 0, trial_claims: 0 });
  const [exporting, setExporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [creditFor, setCreditFor] = useState<Member | null>(null);
  const [creditAmt, setCreditAmt] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);

  const submitCredit = async (sign: 1 | -1) => {
    if (!creditFor) return;
    const dollars = parseFloat(creditAmt || "0");
    if (!dollars || dollars <= 0) { setBanner("Enter a dollar amount."); return; }
    setSavingCredit(true);
    try {
      const r = await api.adminAdjustCredit(creditFor.user_id, Math.round(dollars * 100) * sign, creditReason.trim());
      setBanner(`✅ ${creditFor.name || creditFor.email} balance is now $${(r.balance_cents / 100).toFixed(2)}.`);
      setCreditFor(null); setCreditAmt(""); setCreditReason("");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not update credit.");
    }
    setSavingCredit(false);
  };

  const load = useCallback(async () => {
    try {
      const r = await api.adminMembers();
      setRows(r.members || []);
      setTotals({ total: r.total || 0, trial_claims: r.trial_claims || 0 });
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doExport = async () => {
    setExporting(true);
    setBanner(null);
    try {
      const r = await api.exportMembers();
      setBanner(r.ok
        ? `✅ Spreadsheet emailed to ${r.sent_to} (${r.count} members).`
        : `Could not send the export right now — the email service may be rate-limited. Please try again shortly.`);
    } catch (e: any) {
      setBanner(e?.message || "Export failed. Please try again.");
    }
    setExporting(false);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((m) => {
      if (filter === "Members" && !m.is_member) return false;
      if (filter === "Free Trials" && !(m.trials && m.trials.length > 0)) return false;
      if (!term) return true;
      return (m.name || "").toLowerCase().includes(term) || (m.email || "").toLowerCase().includes(term);
    });
  }, [rows, q, filter]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Members & Trials"
        backTestID="adminmem-back"
        fallback="/admin"
        right={
          <Pressable testID="adminmem-export" onPress={doExport} hitSlop={12} disabled={exporting}>
            {exporting ? <ActivityIndicator size="small" color={colors.brand} /> : <Ionicons name="download-outline" size={24} color={colors.brand} />}
          </Pressable>
        }
      />

      {banner && (
        <Pressable onPress={() => setBanner(null)} style={styles.banner}>
          <Ionicons name="mail" size={16} color={colors.brand} />
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{totals.total}</Text>
          <Text style={styles.statLabel}>MEMBERS</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{rows.filter((m) => m.is_member).length}</Text>
          <Text style={styles.statLabel}>APPROVED</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{totals.trial_claims}</Text>
          <Text style={styles.statLabel}>TRIALS</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.onSurfaceSecondary} />
        <TextInput
          testID="adminmem-search"
          value={q}
          onChangeText={setQ}
          placeholder="Search name or email"
          placeholderTextColor={colors.onSurfaceSecondary}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {!!q && (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f} testID={`adminmem-filter-${f}`} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipOn]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No members found.</Text>
            </View>
          ) : (
            filtered.map((m) => (
              <View key={m.user_id} testID={`adminmem-row-${m.user_id}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(m.name || m.email || "?").slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Pressable testID={`adminmem-name-${m.user_id}`} onPress={() => { setCreditFor(m); setCreditAmt(""); setCreditReason(""); }}>
                      <Text style={styles.name}>{m.name || "—"}</Text>
                      <Text style={styles.email}>{m.email}</Text>
                    </Pressable>
                    {!!m.phone && <Text style={styles.phone}>{m.phone}</Text>}
                    <View style={styles.tagRow}>
                      {m.is_admin && <View style={[styles.tag, { backgroundColor: colors.brand }]}><Text style={styles.tagText}>ADMIN</Text></View>}
                      {m.is_member && <View style={[styles.tag, { backgroundColor: "#16A34A" }]}><Text style={styles.tagText}>MEMBER</Text></View>}
                      {!m.is_member && m.application_status === "pending" && <View style={[styles.tag, { backgroundColor: colors.surfaceTertiary }]}><Text style={[styles.tagText, { color: colors.onSurface }]}>APP PENDING</Text></View>}
                      {(m.trials || []).map((t) => (
                        <View key={t} style={[styles.tag, { backgroundColor: "#7C3AED" }]}><Text style={styles.tagText}>{t?.toUpperCase()} TRIAL</Text></View>
                      ))}
                      {!!m.active_bookings && <View style={[styles.tag, { backgroundColor: colors.surfaceTertiary }]}><Text style={[styles.tagText, { color: colors.onSurface }]}>{m.active_bookings} BOOKED</Text></View>}
                      {!!m.credit_cents && m.credit_cents > 0 && <View style={[styles.tag, { backgroundColor: colors.brandTertiary }]}><Text style={[styles.tagText, { color: colors.brand }]}>${(m.credit_cents / 100).toFixed(0)} CREDIT</Text></View>}
                    </View>
                    <Text style={styles.joined}>Joined {fmtDate(m.created_at)} · {m.provider === "google" ? "Google" : "Email"}</Text>
                  </View>
                  <Pressable testID={`adminmem-credit-${m.user_id}`} onPress={() => { setCreditFor(m); setCreditAmt(""); setCreditReason(""); }} style={styles.creditIconBtn} hitSlop={8}>
                    <Ionicons name="wallet" size={18} color={colors.brand} />
                    <Text style={styles.creditIconText}>Credit</Text>
                  </Pressable>
                </View>
                <View style={styles.contactRow}>
                  <Pressable
                    testID={`adminmem-call-${m.user_id}`}
                    style={[styles.contactBtn, !m.phone && styles.contactBtnDisabled]}
                    disabled={!m.phone}
                    onPress={() => m.phone && Linking.openURL(`tel:${m.phone.replace(/\s/g, "")}`)}
                  >
                    <Ionicons name="call" size={16} color={m.phone ? colors.brand : colors.onSurfaceSecondary} />
                    <Text style={[styles.contactText, !m.phone && { color: colors.onSurfaceSecondary }]}>Call</Text>
                  </Pressable>
                  <Pressable
                    testID={`adminmem-email-${m.user_id}`}
                    style={[styles.contactBtn, !m.email && styles.contactBtnDisabled]}
                    disabled={!m.email}
                    onPress={() => m.email && Linking.openURL(`mailto:${m.email}`)}
                  >
                    <Ionicons name="mail" size={16} color={m.email ? colors.brand : colors.onSurfaceSecondary} />
                    <Text style={[styles.contactText, !m.email && { color: colors.onSurfaceSecondary }]}>Email</Text>
                  </Pressable>
                  <Pressable
                    testID={`adminmem-msg-${m.user_id}`}
                    style={[styles.contactBtn, styles.contactBtnLast]}
                    onPress={() => router.push({ pathname: "/admin/thread", params: { userId: m.user_id, name: m.name || m.email || "Member" } } as any)}
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.brand} />
                    <Text style={styles.contactText}>Message</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={!!creditFor} transparent animationType="fade" onRequestClose={() => setCreditFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Ionicons name="wallet" size={22} color={colors.brand} /></View>
            <Text style={styles.modalTitle}>Adjust credit</Text>
            <Text style={styles.modalSub}>{creditFor?.name || creditFor?.email}</Text>
            <Text style={styles.modalBalance}>Current: ${((creditFor?.credit_cents || 0) / 100).toFixed(2)}</Text>
            <Text style={styles.modalLabel}>Amount ($)</Text>
            <TextInput
              testID="adminmem-credit-amount"
              value={creditAmt}
              onChangeText={setCreditAmt}
              placeholder="e.g. 25"
              placeholderTextColor={colors.onSurfaceSecondary}
              keyboardType="decimal-pad"
              style={styles.modalInput}
            />
            <Text style={styles.modalLabel}>Reason (optional — shown to member)</Text>
            <TextInput
              testID="adminmem-credit-reason"
              value={creditReason}
              onChangeText={setCreditReason}
              placeholder="e.g. Goodwill credit"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable testID="adminmem-credit-remove" style={styles.modalRemove} onPress={() => submitCredit(-1)} disabled={savingCredit}>
                <Text style={styles.modalRemoveText}>Remove</Text>
              </Pressable>
              <Pressable testID="adminmem-credit-add" style={[styles.modalAdd, savingCredit && { opacity: 0.5 }]} onPress={() => submitCredit(1)} disabled={savingCredit}>
                {savingCredit ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalAddText}>ADD CREDIT</Text>}
              </Pressable>
            </View>
            <Pressable onPress={() => setCreditFor(null)} disabled={savingCredit}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
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
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  statsRow: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: 0 },
  statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.onSurface, paddingVertical: 10, fontSize: 15 },
  filters: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  filterChip: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  filterTextOn: { color: colors.onBrand },
  card: { flexDirection: "column", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: "row", gap: spacing.md },
  contactRow: { flexDirection: "row", marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  contactBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border },
  contactBtnLast: { borderRightWidth: 0 },
  contactBtnDisabled: { opacity: 0.4 },
  contactText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  phone: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrand, fontSize: 18, fontWeight: "900" },
  name: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  email: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  joined: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 8 },
  empty: { alignItems: "center", padding: 50, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
  creditIconBtn: { alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: 6 },
  creditIconText: { color: colors.brand, fontSize: 10, fontWeight: "800" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  modalIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  modalSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2 },
  modalBalance: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2, marginBottom: spacing.md },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.sm, marginBottom: 6 },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalRemove: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalRemoveText: { color: colors.onSurface, fontWeight: "800" },
  modalAdd: { flex: 1.6, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalAddText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 0.5 },
  modalCancel: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
});
