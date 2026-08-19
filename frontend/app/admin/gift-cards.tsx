import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type GC = {
  gift_card_id: string; code: string; amount_cents: number; balance_cents: number; status: string;
  recipient_name?: string; recipient_email?: string; purchaser_name?: string; created_at?: string;
  adjustments?: { delta_cents: number; balance_after: number; note?: string; at?: string }[];
};

export default function AdminGiftCards() {
  const [q, setQ] = useState("");
  const [cards, setCards] = useState<GC[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newBal, setNewBal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  const search = useCallback(async () => {
    setLoading(true); setMsg(null);
    try {
      const r = await api.adminGiftcards(q.trim() || undefined);
      setCards(r.gift_cards || []);
    } catch (e: any) {
      setMsg(e?.message || "Could not load gift cards.");
    }
    setLoading(false);
  }, [q]);

  React.useEffect(() => { search(); }, []);
  const saveAdjust = async (gc: GC) => {
    const dollars = parseFloat(newBal);
    if (Number.isNaN(dollars) || dollars < 0 || dollars * 100 > gc.amount_cents) {
      setMsg(`New balance must be between $0 and ${money(gc.amount_cents)}.`); return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await api.adminGiftcardAdjust(gc.code, Math.round(dollars * 100), "In-store adjustment");
      setCards((cur) => cur.map((c) => (c.gift_card_id === gc.gift_card_id ? r.gift_card : c)));
      setEditing(null); setNewBal("");
    } catch (e: any) {
      setMsg(e?.message || "Could not update balance.");
    }
    setBusy(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Gift Cards" backTestID="agc-back" fallback="/admin" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.searchRow}>
          <TextInput
            testID="agc-search"
            style={styles.search}
            placeholder="Search code or email…"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="characters"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={search}
            returnKeyType="search"
          />
          <Pressable testID="agc-search-btn" style={styles.searchBtn} onPress={search}>
            <Ionicons name="search" size={18} color={colors.onBrand} />
          </Pressable>
        </View>

        {msg && <Text style={styles.errText}>{msg}</Text>}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
            {cards.length === 0 ? (
              <Text style={styles.empty}>No gift cards found.</Text>
            ) : cards.map((gc) => (
              <View key={gc.gift_card_id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.code}>{gc.code}</Text>
                  <View style={[styles.statusPill, gc.status !== "active" && styles.statusPillOff]}>
                    <Text style={[styles.statusText, gc.status !== "active" && styles.statusTextOff]}>{gc.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.balance}>{money(gc.balance_cents)} <Text style={styles.balanceOf}>of {money(gc.amount_cents)} remaining</Text></Text>
                <Text style={styles.meta}>
                  {gc.recipient_name || gc.recipient_email ? `For ${gc.recipient_name || ""} ${gc.recipient_email ? `(${gc.recipient_email})` : ""}` : "—"}
                </Text>
                {gc.purchaser_name && <Text style={styles.meta}>From {gc.purchaser_name}</Text>}

                {editing === gc.gift_card_id ? (
                  <View style={styles.adjustRow}>
                    <View style={styles.adjustInputWrap}>
                      <Text style={styles.dollar}>$</Text>
                      <TextInput
                        testID={`agc-newbal-${gc.gift_card_id}`}
                        style={styles.adjustInput}
                        placeholder={(gc.balance_cents / 100).toFixed(2)}
                        placeholderTextColor={colors.onSurfaceSecondary}
                        keyboardType="decimal-pad"
                        value={newBal}
                        onChangeText={(t) => setNewBal(t.replace(/[^0-9.]/g, ""))}
                        autoFocus
                      />
                    </View>
                    <Pressable testID={`agc-save-${gc.gift_card_id}`} style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={() => saveAdjust(gc)} disabled={busy}>
                      {busy ? <ActivityIndicator color={colors.onBrand} size="small" /> : <Text style={styles.saveText}>Save</Text>}
                    </Pressable>
                    <Pressable testID={`agc-cancel-${gc.gift_card_id}`} style={styles.cancelBtn} onPress={() => { setEditing(null); setNewBal(""); setMsg(null); }}>
                      <Ionicons name="close" size={18} color={colors.onSurfaceSecondary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    testID={`agc-adjust-${gc.gift_card_id}`}
                    style={styles.adjustBtn}
                    onPress={() => { setEditing(gc.gift_card_id); setNewBal(""); setMsg(null); }}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.brand} />
                    <Text style={styles.adjustBtnText}>Adjust balance (in-store use)</Text>
                  </Pressable>
                )}

                {!!(gc.adjustments && gc.adjustments.length) && (
                  <View style={styles.history}>
                    {gc.adjustments.slice(-3).reverse().map((a, i) => (
                      <Text key={i} style={styles.historyText}>
                        {a.delta_cents < 0 ? "−" : "+"}{money(Math.abs(a.delta_cents))} → {money(a.balance_after)}{a.note ? ` · ${a.note}` : ""}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  searchRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  search: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, fontSize: 15, paddingHorizontal: spacing.md, paddingVertical: 11 },
  searchBtn: { width: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  errText: { color: colors.error, fontSize: 13, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { color: colors.onSurface, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  statusPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusPillOff: { backgroundColor: colors.surfaceTertiary },
  statusText: { color: colors.brand, fontSize: 10.5, fontWeight: "900", letterSpacing: 0.5 },
  statusTextOff: { color: colors.onSurfaceSecondary },
  balance: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginTop: 2 },
  balanceOf: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  meta: { color: colors.onSurfaceSecondary, fontSize: 13 },
  adjustBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm },
  adjustBtnText: { color: colors.brand, fontSize: 13.5, fontWeight: "800" },
  adjustRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  adjustInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, paddingHorizontal: spacing.md },
  dollar: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  adjustInput: { flex: 1, color: colors.onSurface, fontSize: 18, fontWeight: "900", paddingVertical: 10, paddingHorizontal: 6 },
  saveBtn: { backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.md },
  saveText: { color: colors.onBrand, fontWeight: "900", fontSize: 14 },
  cancelBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  history: { marginTop: spacing.sm, gap: 3, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  historyText: { color: colors.onSurfaceSecondary, fontSize: 12 },
});
