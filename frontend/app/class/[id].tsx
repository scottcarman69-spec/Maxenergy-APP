import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Modal } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api, BACKEND_URL } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { classTime, classDate, qldTodayUTC } from "@/src/datetime";
import { coachSource } from "@/src/coaches";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  trainer_photo?: string;
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
  return `${classDate(iso, { weekday: "long", day: "2-digit", month: "long" })} · ${classTime(iso)}`;
}

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cls, setCls] = useState<Cls | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDay, setApptDay] = useState(0);
  const [apptHour, setApptHour] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.classDetail(id);
      setCls(c);
    } catch (e: any) {
      setMsg(e?.message || "Failed to load");
    }
    try {
      const a = await api.myApplications();
      setIsMember((a.applications || []).length > 0);
    } catch {
      setIsMember(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const proceedBooking = async (requestedTime?: string, requestedAt?: string) => {
    if (!cls) return;
    setBusy(true);
    setMsg(null);
    try {
      const { booking } = await api.createBooking(cls.class_id, requestedTime, requestedAt);

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
              setBusy(false);
              router.replace({ pathname: "/receipt", params: { booking_id: booking.booking_id } });
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

  const onBookPress = () => {
    if (cls?.by_appointment) {
      setApptDay(0);
      setApptHour(null);
      setMsg(null);
      setApptOpen(true);
    } else {
      proceedBooking();
    }
  };

  // Preferred-time picker (appointment classes): next 14 Queensland days + hourly slots.
  const MIN_LEAD_MS = 24 * 60 * 60 * 1000;
  const apptDays = React.useMemo(() => {
    const base = qldTodayUTC();
    return Array.from({ length: 14 }, (_, i) =>
      new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i))
    );
  }, []);
  const APPT_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const slotInstant = (d: Date, h: number) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h) - 10 * 3600 * 1000;
  const slotIso = (d: Date, h: number) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00`;

  const confirmAppt = () => {
    if (apptHour === null) return;
    const d = apptDays[apptDay];
    const iso = slotIso(d, apptHour);
    const label = `${classDate(iso, { weekday: "short", day: "2-digit", month: "short" })} · ${classTime(iso)}`;
    setApptOpen(false);
    proceedBooking(label, iso);
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

          {coachSource(cls.trainer, cls.trainer_photo) ? (
            <Pressable
              testID="coach-card"
              style={({ pressed }) => [styles.coachCard, pressed && { opacity: 0.85 }]}
              onPress={() => router.push({ pathname: "/coach", params: { name: cls.trainer } })}
            >
              <Image source={coachSource(cls.trainer, cls.trainer_photo)} style={styles.coachAvatar} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.coachLabel}>YOUR COACH</Text>
                <Text style={styles.coachName}>{cls.trainer}</Text>
                <Text style={styles.coachHint}>Tap to view bio & qualifications</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.brand} />
            </Pressable>
          ) : null}

          <Text style={styles.sectionTitle}>ABOUT</Text>
          <Text style={styles.desc}>{cls.description}</Text>

          {isMember === false && (
            <Pressable testID="join-notice" style={styles.joinNotice} onPress={() => router.push("/vigyr-signon")}>
              <View style={styles.joinIcon}>
                <Ionicons name="card" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.joinTitle}>Not a member yet?</Text>
                <Text style={styles.joinBody}>Join Maxenergy Fitness to book classes. Tap here to sign up.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brand} />
            </Pressable>
          )}

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
          onPress={onBookPress}
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

      <Modal visible={apptOpen} transparent animationType="slide" onRequestClose={() => setApptOpen(false)}>
        <View style={styles.apptOverlay}>
          <View style={styles.apptSheet}>
            <View style={styles.apptHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.apptTitle}>Request a time</Text>
                <Text style={styles.apptSub}>{cls.name} · at least 24 hours ahead</Text>
              </View>
              <Pressable testID="appt-close" onPress={() => setApptOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            <Text style={styles.apptLabel}>PREFERRED DAY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 4 }}>
              {apptDays.map((d, i) => {
                const active = i === apptDay;
                return (
                  <Pressable
                    key={i}
                    testID={`appt-day-${i}`}
                    onPress={() => { setApptDay(i); setApptHour(null); }}
                    style={[styles.apptDayChip, active && styles.apptChipActive]}
                  >
                    <Text style={[styles.apptDayLabel, active && styles.apptChipTextActive]}>
                      {classDate(slotIso(d, 12), { weekday: "short" }).toUpperCase()}
                    </Text>
                    <Text style={[styles.apptDayNum, active && styles.apptChipTextActive]}>{d.getUTCDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.apptLabel, { marginTop: spacing.lg }]}>PREFERRED TIME</Text>
            <View style={styles.apptTimeWrap}>
              {APPT_HOURS.map((h) => {
                const d = apptDays[apptDay];
                const disabled = slotInstant(d, h) < Date.now() + MIN_LEAD_MS;
                const active = apptHour === h;
                return (
                  <Pressable
                    key={h}
                    testID={`appt-time-${h}`}
                    disabled={disabled}
                    onPress={() => setApptHour(h)}
                    style={[styles.apptTimeChip, active && styles.apptChipActive, disabled && styles.apptTimeDisabled]}
                  >
                    <Text style={[styles.apptTimeText, active && styles.apptChipTextActive, disabled && styles.apptTimeTextDisabled]}>
                      {classTime(slotIso(d, h))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="appt-confirm"
              style={[styles.apptConfirm, (apptHour === null || busy) && { opacity: 0.5 }]}
              onPress={confirmAppt}
              disabled={apptHour === null || busy}
            >
              <Text style={styles.apptConfirmText}>CONTINUE TO PAYMENT</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </Pressable>
            <Text style={styles.apptFoot}>We'll confirm your exact time after your request.</Text>
          </View>
        </View>
      </Modal>
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
  coachCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  coachAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surfaceTertiary },
  coachLabel: { color: colors.onSurfaceSecondary, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  coachName: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: 2 },
  coachHint: { color: colors.brand, fontSize: 12, fontWeight: "600", marginTop: 3 },
  sectionTitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: spacing.md,
  },
  desc: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  joinNotice: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.brand },
  joinIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  joinTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  joinBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
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
  apptOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  apptSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 34 : spacing.xl, borderWidth: 1, borderColor: colors.border },
  apptHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  apptTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  apptSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  apptLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: spacing.sm },
  apptDayChip: { width: 56, height: 66, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  apptDayLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  apptDayNum: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 3 },
  apptChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  apptChipTextActive: { color: colors.onBrand },
  apptTimeWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  apptTimeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  apptTimeText: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  apptTimeDisabled: { opacity: 0.35 },
  apptTimeTextDisabled: { color: colors.onSurfaceSecondary },
  apptConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.pill, marginTop: spacing.xl },
  apptConfirmText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  apptFoot: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.md },
});
