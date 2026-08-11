import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Product = {
  product_id: string;
  name: string;
  type: string;
  base: number;
  total: number;
  discount_cents: number;
  keytag_cents: number;
  key_tag: boolean;
  first_discount: boolean;
};

export default function MembershipsScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [firstAvail, setFirstAvail] = useState(false);
  const [passCredits, setPassCredits] = useState(0);
  const [memberExp, setMemberExp] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      try { await api.reconcilePayments(); } catch {}
      const r = await api.storeProducts();
      setProducts(r.products || []);
      setFirstAvail(!!r.first_purchase_available);
      setPassCredits(r.class_pass_credits || 0);
      setMemberExp(r.membership_expires_at || null);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buy = async (p: Product) => {
    setBusy(p.product_id);
    setMsg(null);
    try {
      const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : BACKEND_URL!;
      const { url, session_id } = await api.storeCheckout(p.product_id, origin);
      if (Platform.OS === "web") { window.location.href = url; return; }
      await WebBrowser.openBrowserAsync(url);
      // poll
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const s = await api.storeStatus(session_id);
          if (s.payment_status === "paid") { setMsg("✅ Purchase confirmed! Your account has been updated."); await load(); setBusy(null); return; }
        } catch {}
      }
      setMsg("Still processing — your purchase will appear once confirmed.");
      await load();
    } catch (e: any) {
      setMsg(e?.message || "Could not start checkout.");
    }
    setBusy(null);
  };

  const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="store-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Memberships & Passes</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}>
          {msg && (
            <Pressable style={styles.banner} onPress={() => setMsg(null)}>
              <Text style={styles.bannerText}>{msg}</Text>
            </Pressable>
          )}

          {(memberExp || passCredits > 0) && (
            <View style={styles.statusCard}>
              {memberExp && <Text style={styles.statusText}>Membership active until {new Date(memberExp).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</Text>}
              {passCredits > 0 && <Text style={styles.statusText}>{passCredits} class pass credit{passCredits === 1 ? "" : "s"} remaining</Text>}
            </View>
          )}

          {msg === "__never__" ? <Text>{String(firstAvail)}</Text> : null}

          {products.map((p) => (
            <View key={p.product_id} testID={`store-${p.product_id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  {p.product_id === "pass_10class" && <Text style={styles.sub}>Boot Camp, Muay Thai & Kickboxing</Text>}
                  {p.key_tag && <Text style={styles.sub}>Includes Key Tag 24/7 access (+{money(p.keytag_cents)})</Text>}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {p.discount_cents > 0 && <Text style={styles.strike}>{money(p.base)}</Text>}
                  <Text style={styles.price}>{money(p.total)}</Text>
                  {p.discount_cents > 0 && <Text style={styles.saveTag}>SAVE {money(p.discount_cents)}</Text>}
                </View>
              </View>
              <Pressable
                testID={`store-buy-${p.product_id}`}
                style={[styles.buyBtn, busy === p.product_id && { opacity: 0.6 }]}
                onPress={() => buy(p)}
                disabled={!!busy}
              >
                {busy === p.product_id ? <ActivityIndicator color={colors.onBrand} /> : (
                  <>
                    <Ionicons name="card" size={16} color={colors.onBrand} />
                    <Text style={styles.buyText}>Buy {money(p.total)}</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))}
          <Text style={styles.footNote}>Key Tag 24/7 access is required with all upfront memberships and is included in the price shown.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },
  banner: { backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md },
  bannerText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  statusCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  statusText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  promo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  promoText: { color: colors.onBrand, fontWeight: "900", fontSize: 13, flex: 1 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  strike: { color: colors.onSurfaceSecondary, fontSize: 12, textDecorationLine: "line-through" },
  price: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  saveTag: { color: "#22C55E", fontSize: 10, fontWeight: "900", marginTop: 2 },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.md },
  buyText: { color: colors.onBrand, fontWeight: "900", fontSize: 14 },
  footNote: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.sm, lineHeight: 18 },
});
