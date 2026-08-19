import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Modal, Image, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { classDate, classTime, qldTodayUTC } from "@/src/datetime";

// Class-pass products render as the actual promo poster artwork (tappable to buy).
const PASS_IMAGES: Record<string, { src: any; aspect: number }> = {
  pass_1class: { src: require("@/assets/images/pass-single.png"), aspect: 1047 / 667 },
  pass_10class: { src: require("@/assets/images/pass-10.png"), aspect: 1062 / 642 },
};

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
  perks?: string[];
};

export default function MembershipsScreen() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const passW = winW - spacing.lg * 2;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [firstAvail, setFirstAvail] = useState(false);
  const [passCredits, setPassCredits] = useState(0);
  const [memberExp, setMemberExp] = useState<string | null>(null);
  const [formDone, setFormDone] = useState(true);
  const [setupFor, setSetupFor] = useState<Product | null>(null);
  const [dayIdx, setDayIdx] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  // Next 30 Queensland days for the membership start date.
  const days = React.useMemo(() => {
    const base = qldTodayUTC();
    return Array.from({ length: 30 }, (_, i) =>
      new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i))
    );
  }, []);
  const MEET_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const dayIso = (d: Date, h = 12) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00`;

  const load = useCallback(async () => {
    try {
      const r = await api.storeProducts();
      setProducts(r.products || []);
      setFirstAvail(!!r.first_purchase_available);
      setPassCredits(r.class_pass_credits || 0);
      setMemberExp(r.membership_expires_at || null);
      setFormDone(!!r.membership_form_completed);
    } catch {}
    setLoading(false);
    // Reconcile any pending Square payments in the background (doesn't block the UI).
    api.reconcilePayments().catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onBuyPress = (p: Product) => {
    if (!formDone) {
      router.push({ pathname: "/membership", params: { next: "store" } });
      return;
    }
    if (p.type === "membership") {
      setDayIdx(null); setHour(null); setSetupFor(p);
    } else {
      buy(p);
    }
  };

  const confirmSetup = () => {
    if (!setupFor || dayIdx === null || hour === null) return;
    const d = days[dayIdx];
    const start_date = classDate(dayIso(d), { weekday: "short", day: "2-digit", month: "short" });
    const meet_time = classTime(dayIso(d, hour));
    buy(setupFor, { start_date, meet_time });
  };

  const buy = async (p: Product, extra?: { start_date?: string; meet_time?: string }) => {
    setSetupFor(null);
    setBusy(p.product_id);
    setMsg(null);
    try {
      const origin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : BACKEND_URL!;
      const { url, session_id } = await api.storeCheckout(p.product_id, origin, extra);
      if (Platform.OS === "web") { window.location.href = url; return; }
      await WebBrowser.openBrowserAsync(url);
      // poll
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const s = await api.storeStatus(session_id);
          if (s.payment_status === "paid") { setBusy(null); router.push({ pathname: "/store-receipt", params: { session_id } }); return; }
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
      <ScreenHeader title="Memberships & Passes" backTestID="store-back" />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}>
          {msg && (
            <Pressable style={styles.banner} onPress={() => setMsg(null)}>
              <Text style={styles.bannerText}>{msg}</Text>
            </Pressable>
          )}

          {(memberExp || passCredits > 0) && (            <View style={styles.statusCard}>
              {memberExp && <Text style={styles.statusText}>Membership active until {new Date(memberExp).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</Text>}
              {passCredits > 0 && <Text style={styles.statusText}>{passCredits} class pass credit{passCredits === 1 ? "" : "s"} remaining</Text>}
            </View>
          )}

          {formDone ? (
            <View style={styles.formOk}>
              <Ionicons name="shield-checkmark" size={18} color="#22C55E" />
              <Text style={styles.formOkText}>Membership form on file ✓</Text>
            </View>
          ) : (
            <Pressable testID="store-form-prompt" style={styles.formPrompt} onPress={() => router.push({ pathname: "/membership", params: { next: "store" } })}>
              <Ionicons name="document-text" size={20} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.formPromptTitle}>Complete your membership form</Text>
                <Text style={styles.formPromptSub}>A one-time form is required before your first purchase.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brand} />
            </Pressable>
          )}

          <LinearGradient colors={["#FF7A00", "#FF3D00"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <Ionicons name="barbell" size={26} color="#fff" />
            <Text style={styles.heroTitle}>UNLEASH YOUR POTENTIAL</Text>
            <Text style={styles.heroSub}>Pick a plan and start training today 💪</Text>
          </LinearGradient>

          {products.map((p) => {
            const passImg = p.type === "class_pass" ? PASS_IMAGES[p.product_id] : undefined;
            if (passImg) {
              return (
                <Pressable
                  key={p.product_id}
                  testID={`store-buy-${p.product_id}`}
                  style={[styles.passImageWrap, busy === p.product_id && { opacity: 0.6 }]}
                  onPress={() => onBuyPress(p)}
                  disabled={!!busy}
                >
                  <Image source={passImg.src} style={{ width: passW, height: Math.round(passW / passImg.aspect) }} resizeMode="cover" />
                  {busy === p.product_id && (
                    <View style={styles.passImageBusy}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            }
            const popular = p.product_id === "mem_3m";
            return (
            <View key={p.product_id} testID={`store-${p.product_id}`} style={[styles.card, popular && styles.cardPopular]}>
              {popular && <View style={styles.popularTag}><Text style={styles.popularText}>⭐ MOST POPULAR</Text></View>}
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{p.name}</Text>
                  {p.product_id === "pass_10class" && <Text style={styles.sub}>Boot Camp, Muay Thai & Kickboxing</Text>}
                  {p.type === "membership" && <Text style={styles.sub}>You'll pick a start date & access-card setup time</Text>}
                  {p.key_tag && <Text style={styles.sub}>🔑 Includes Key Tag 24/7 access (+{money(p.keytag_cents)})</Text>}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.price}>{money(p.total)}</Text>
                </View>
              </View>
              {!!p.perks?.length && (
                <View style={styles.perks}>
                  {p.perks.map((perk, i) => (
                    <View key={i} style={styles.perkRow}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                      <Text style={styles.perkText}>{perk}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                testID={`store-buy-${p.product_id}`}
                style={[styles.buyBtn, busy === p.product_id && { opacity: 0.6 }]}
                onPress={() => onBuyPress(p)}
                disabled={!!busy}
              >
                {busy === p.product_id ? <ActivityIndicator color={colors.onBrand} /> : (
                  <>
                    <Ionicons name="flash" size={16} color={colors.onBrand} />
                    <Text style={styles.buyText}>Get started — {money(p.total)}</Text>
                  </>
                )}
              </Pressable>
            </View>
            );
          })}
          <Text style={styles.footNote}>Key Tag 24/7 access is required with all upfront memberships and is included in the price shown.</Text>

          <View style={styles.bottomStrip}>
            {[
              { icon: "shield-checkmark", label: "NO LOCK IN", sub: "TRAIN FREELY" },
              { icon: "calendar", label: "FLEXIBLE", sub: "TRAIN YOUR WAY" },
              { icon: "people", label: "ALL LEVELS", sub: "WELCOME" },
              { icon: "star", label: "COMMUNITY", sub: "THAT PUSHES YOU" },
            ].map((s, i) => (
              <View key={i} style={styles.stripCol}>
                <Ionicons name={s.icon as any} size={20} color={colors.brand} />
                <Text style={styles.stripLabel}>{s.label}</Text>
                <Text style={styles.stripSub}>{s.sub}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Modal visible={!!setupFor} transparent animationType="slide" onRequestClose={() => setSetupFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Set up your access card</Text>
                <Text style={styles.modalSub}>{setupFor?.name}</Text>
              </View>
              <Pressable testID="setup-close" onPress={() => setSetupFor(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>MEMBERSHIP START DATE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
              {days.map((d, i) => {
                const active = i === dayIdx;
                return (
                  <Pressable
                    key={i}
                    testID={`setup-day-${i}`}
                    onPress={() => setDayIdx(i)}
                    style={[styles.dayChip, active && styles.chipActive]}
                  >
                    <Text style={[styles.dayChipLabel, active && styles.chipTextActive]}>
                      {classDate(dayIso(d), { weekday: "short" }).toUpperCase()}
                    </Text>
                    <Text style={[styles.dayChipNum, active && styles.chipTextActive]}>{d.getUTCDate()}</Text>
                    <Text style={[styles.dayChipMon, active && styles.chipTextActive]}>
                      {classDate(dayIso(d), { month: "short" }).toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.modalLabel, { marginTop: spacing.lg }]}>TIME TO MEET AT THE GYM</Text>
            <View style={styles.timeWrap}>
              {MEET_HOURS.map((h) => {
                const active = hour === h;
                return (
                  <Pressable
                    key={h}
                    testID={`setup-time-${h}`}
                    onPress={() => setHour(h)}
                    style={[styles.timeChip, active && styles.chipActive]}
                  >
                    <Text style={[styles.timeChipText, active && styles.chipTextActive]}>
                      {classTime(dayIso(days[0], h))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="setup-continue"
              style={[styles.modalGo, (dayIdx === null || hour === null) && { opacity: 0.5 }]}
              disabled={dayIdx === null || hour === null}
              onPress={confirmSetup}
            >
              <Text style={styles.modalGoText}>CONTINUE TO PAYMENT</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </Pressable>
            <Text style={styles.modalFoot}>Come in at this time on your start date and we'll set up your 24/7 key tag.</Text>
          </View>
        </View>
      </Modal>
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
  formOk: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(34,197,94,0.10)", borderWidth: 1, borderColor: "#22C55E55", borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  formOkText: { color: "#22C55E", fontSize: 13, fontWeight: "800" },
  formPrompt: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  formPromptTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  formPromptSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  promo: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  promoText: { color: colors.onBrand, fontWeight: "900", fontSize: 13, flex: 1 },
  card: { backgroundColor: "rgba(255,255,255,0.045)", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: radius.lg, padding: spacing.lg },
  cardPopular: { backgroundColor: "rgba(255,122,0,0.08)", borderColor: colors.brand, borderWidth: 2 },
  popularTag: { alignSelf: "flex-start", backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: spacing.sm },
  popularText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  hero: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", gap: 4 },
  heroTitle: { color: "#fff", fontSize: 20, fontWeight: "900", letterSpacing: 0.5, marginTop: 6 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xxl, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  modalSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2 },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: spacing.sm, marginBottom: 8 },
  dayChip: { width: 60, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, alignItems: "center" },
  dayChipLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800" },
  dayChipNum: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginVertical: 1 },
  dayChipMon: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
  timeWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  timeChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  timeChipText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTextActive: { color: colors.onBrand },
  modalGo: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: radius.md, backgroundColor: colors.brand, marginTop: spacing.xl },
  modalGoText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 0.3, fontSize: 15 },
  modalFoot: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.md, lineHeight: 17 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  perks: { marginTop: spacing.md, gap: 8 },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  perkText: { color: colors.onSurfaceTertiary, fontSize: 13, flex: 1, lineHeight: 18 },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "900" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  strike: { color: colors.onSurfaceSecondary, fontSize: 12, textDecorationLine: "line-through" },
  price: { color: colors.brand, fontSize: 22, fontWeight: "900" },
  saveTag: { color: "#22C55E", fontSize: 10, fontWeight: "900", marginTop: 2 },
  buyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.md },
  buyText: { color: colors.onBrand, fontWeight: "900", fontSize: 14 },
  footNote: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.sm, lineHeight: 18 },

  // Poster-style class-pass cards (actual promo artwork)
  passImageWrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#0A0A0A" },
  passImageBusy: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },

  // Bottom feature strip
  bottomStrip: { flexDirection: "row", backgroundColor: "#0D0D0D", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: radius.lg, paddingVertical: spacing.md, marginTop: spacing.sm },
  stripCol: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 4 },
  stripLabel: { color: "#fff", fontSize: 10.5, fontWeight: "900", textAlign: "center", letterSpacing: 0.2 },
  stripSub: { color: colors.onSurfaceSecondary, fontSize: 8.5, fontWeight: "700", textAlign: "center", letterSpacing: 0.2 },
});
