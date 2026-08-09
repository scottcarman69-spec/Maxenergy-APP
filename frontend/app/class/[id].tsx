import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  duration_min: number;
  price_cents: number;
  image: string;
  start_at: string;
  description: string;
  level: string;
  capacity: number;
  by_appointment?: boolean;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "long", day: "2-digit", month: "long" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<Cls | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.classDetail(id);
      setCls(c);
    } catch (e: any) {
      setMsg(e?.message || "Failed to load");
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bookAndPay = async () => {
    if (!cls) return;
    setBusy(true);
    setMsg(null);
    try {
      const { booking } = await api.createBooking(cls.class_id);

      if (booking.status === "paid") {
        setMsg("Already booked. See you there!");
        setBusy(false);
        return;
      }

      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : BACKEND_URL!;
      const { url, session_id } = await api.checkout(booking.booking_id, origin);

      let opened = false;
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          window.location.href = url;
          opened = true;
        }
      } else {
        const result = await WebBrowser.openBrowserAsync(url, { showTitle: false });
        opened = !!result;
      }

      if (opened) {
        // Poll status
        setMsg("Checking payment status...");
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const s = await api.paymentStatus(session_id);
            if (s.payment_status === "paid") {
              setMsg("Payment successful. Class booked!");
              setBusy(false);
              setTimeout(() => router.replace("/(tabs)/profile"), 1200);
              return;
            }
            if (s.status === "expired") {
              setMsg("Session expired. Try again.");
              setBusy(false);
              return;
            }
          } catch {}
        }
        setMsg("Still processing. Check Profile in a moment.");
      }
    } catch (e: any) {
      setMsg(e?.message || "Booking failed");
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }
  if (!cls) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={{ color: colors.onSurface, padding: 20 }}>Class not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.hero}>
          <Image source={cls.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(18,18,20,0.55)", "transparent", "rgba(18,18,20,0.95)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <Pressable testID="class-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <View style={styles.levelPill}>
              <Text style={styles.levelText}>{cls.level}</Text>
            </View>
            <Text style={styles.title}>{cls.name}</Text>
            <Text style={styles.trainer}>with {cls.trainer}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaGrid}>
            <View style={styles.metaCol}>
              <Ionicons name="calendar-outline" size={16} color={colors.brand} />
              <Text style={styles.metaLabel}>WHEN</Text>
              <Text style={styles.metaVal}>{cls.by_appointment ? "By appointment" : fmt(cls.start_at)}</Text>
            </View>
            <View style={styles.metaCol}>
              <Ionicons name="time-outline" size={16} color={colors.brand} />
              <Text style={styles.metaLabel}>DURATION</Text>
              <Text style={styles.metaVal}>{cls.duration_min} minutes</Text>
            </View>
            <View style={styles.metaCol}>
              <Ionicons name="people-outline" size={16} color={colors.brand} />
              <Text style={styles.metaLabel}>SPOTS</Text>
              <Text style={styles.metaVal}>{cls.by_appointment ? "1-on-1" : `${cls.capacity} max`}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>ABOUT</Text>
          <Text style={styles.desc}>{cls.description}</Text>

          {!!(cls as any).program && (
            <View style={styles.programBanner}>
              <Ionicons name="school" size={18} color={colors.brand} />
              <Text style={styles.programBannerText}>
                {(cls as any).program} · runs each school term. Enrol via Membership for the full term.
              </Text>
            </View>
          )}

          {msg && <Text style={styles.msg}>{msg}</Text>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.priceLabel}>PRICE</Text>
          <Text style={styles.priceVal}>${(cls.price_cents / 100).toFixed(0)} AUD</Text>
        </View>
        <Pressable
          testID="book-and-pay-button"
          style={({ pressed }) => [styles.payBtn, pressed && { opacity: 0.85 }]}
          onPress={bookAndPay}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Text style={styles.payBtnText}>{cls.by_appointment ? "BOOK SESSION" : "BOOK & PAY"}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 380, justifyContent: "flex-end" },
  heroSafe: { position: "absolute", top: 0, left: 0, right: 0 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(18,18,20,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.lg,
    marginTop: spacing.md,
  },
  heroBottom: { padding: spacing.xl },
  levelPill: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  levelText: { color: colors.onBrand, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 36, fontWeight: "900", letterSpacing: -0.5 },
  trainer: { color: colors.onSurfaceSecondary, fontSize: 14, marginTop: 4 },
  body: { padding: spacing.xl, gap: spacing.md },
  metaGrid: { flexDirection: "row", gap: spacing.md },
  metaCol: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  metaLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  metaVal: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  sectionTitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: spacing.md,
  },
  desc: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  programBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  programBannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  msg: { color: colors.brand, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 32 : spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  priceLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  priceVal: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  payBtn: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: 16,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  payBtnText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
