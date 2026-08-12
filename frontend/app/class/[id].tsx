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
import { useAuth } from "@/src/AuthContext";
import FlashingText from "@/src/components/FlashingText";

const FLASH_LINE = "All fitness and experience levels welcome.";

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
  booked?: number;
  spots_left?: number;
  by_appointment?: boolean;
  appt_durations?: { minutes: number; price_cents: number }[];
};

function fmt(iso: string) {
  return `${classDate(iso, { weekday: "long", day: "2-digit", month: "long" })} · ${classTime(iso)}`;
}

export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [cls, setCls] = useState<Cls | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDay, setApptDay] = useState(0);
  const [apptHour, setApptHour] = useState<number | null>(null);
  const [apptDuration, setApptDuration] = useState<number | null>(null);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [credit, setCredit] = useState(0);
  const [passes, setPasses] = useState(0);
  const [creditOpen, setCreditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const c = await api.classDetail(id);
      setCls(c);
    } catch (e: any) {
      setMsg(e?.message || "Failed to load");
    }
    try {
      const m = await api.me();
      setCredit(m?.user?.credit_cents || 0);
      setPasses(m?.user?.class_pass_credits || 0);
    } catch {}
    try {
      const a = await api.myApplications();
      setIsMember((a.applications || []).length > 0);
    } catch {
      setIsMember(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  const proceedBooking = async (requestedTime?: string, requestedAt?: string, useCredit?: boolean, useClassPass?: boolean, durationMin?: number) => {
    if (!cls) return;
    setCreditOpen(false);
    setBusy(true);
    setMsg(null);
    try {
      const { booking } = await api.createBooking(cls.class_id, requestedTime, requestedAt, durationMin);

      if (booking.status === "paid") {
        setMsg("Already booked. See you there!");
        setBusy(false);
        return;
      }

      const origin =
        Platform.OS === "web" && typeof window !== "undefined"
          ? window.location.origin
          : BACKEND_URL!;
      const res = await api.checkout(booking.booking_id, origin, useCredit, useClassPass);

      // Fully covered by in-app credit or a class pass — no card payment needed.
      if (res.paid_with_credit || res.paid_with_pass) {
        setBusy(false);
        router.replace({ pathname: "/receipt", params: { booking_id: booking.booking_id } });
        return;
      }
      const { url, session_id } = res;

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
        // Safety net: the redirect/poll window may have been missed — reconcile with Square.
        try {
          const r = await api.reconcilePayments();
          if ((r.paid_booking_ids || []).includes(booking.booking_id)) {
            setBusy(false);
            router.replace({ pathname: "/receipt", params: { booking_id: booking.booking_id } });
            return;
          }
        } catch {}
        setMsg("Still processing. Check My Bookings in a moment.");
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
      const opts = cls.appt_durations || [];
      setApptDuration(opts.length ? opts[0].minutes : null);
      setMsg(null);
      api.appointmentsTaken()
        .then((r) => setTakenSlots(new Set(r.taken || [])))
        .catch(() => {});
      setApptOpen(true);
    } else if (credit > 0 || passes > 0) {
      setMsg(null);
      setCreditOpen(true);
    } else {
      proceedBooking();
    }
  };

  // Preferred-time picker (appointment classes): Mon–Thu only, 10:30am–4:00pm (Queensland).
  const MIN_LEAD_MS = 24 * 60 * 60 * 1000;
  const apptDays = React.useMemo(() => {
    const base = qldTodayUTC();
    const out: Date[] = [];
    for (let i = 0; i < 28 && out.length < 8; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
      const wd = d.getUTCDay(); // Sun=0 .. Sat=6
      if (wd >= 1 && wd <= 4) out.push(d); // Mon–Thu
    }
    return out;
  }, []);
  const APPT_SLOTS: { h: number; m: number }[] = [
    { h: 10, m: 30 }, { h: 11, m: 0 }, { h: 11, m: 30 }, { h: 12, m: 0 }, { h: 12, m: 30 },
    { h: 13, m: 0 }, { h: 13, m: 30 }, { h: 14, m: 0 }, { h: 14, m: 30 },
    { h: 15, m: 0 }, { h: 15, m: 30 }, { h: 16, m: 0 },
  ];
  const slotInstant = (d: Date, h: number, m: number) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - 10 * 3600 * 1000;
  const slotIso = (d: Date, h: number, m: number) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

  const confirmAppt = () => {
    if (apptHour === null) return;
    const opts = cls?.appt_durations || [];
    if (opts.length && apptDuration === null) return;
    const d = apptDays[apptDay];
    const h = Math.floor(apptHour / 60);
    const m = apptHour % 60;
    const iso = slotIso(d, h, m);
    const label = `${classDate(iso, { weekday: "short", day: "2-digit", month: "short" })} · ${classTime(iso)}`;
    setApptOpen(false);
    proceedBooking(label, iso, undefined, undefined, apptDuration ?? undefined);
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

  const isFull = !cls.by_appointment && cls.spots_left === 0;

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
          {typeof cls.spots_left === "number" && cls.spots_left > 0 && cls.spots_left <= 3 && !cls.by_appointment && (
            <View style={styles.nudgeBanner}>
              <Ionicons name="flame" size={16} color={colors.onBrand} />
              <Text style={styles.nudgeBannerText}>Only {cls.spots_left} spot{cls.spots_left === 1 ? "" : "s"} left — book early to secure your place!</Text>
            </View>
          )}
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
              <Text style={styles.metaVal}>
                {cls.by_appointment
                  ? "1-on-1"
                  : typeof cls.spots_left === "number"
                    ? cls.spots_left === 0 ? "Class full" : `${cls.spots_left} of ${cls.capacity} left`
                    : `${cls.capacity} max`}
              </Text>
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
          {(() => {
            const raw = cls.description || "";
            const idx = raw.indexOf(FLASH_LINE);
            if (idx === -1) return <Text style={styles.desc}>{raw}</Text>;
            const before = raw.slice(0, idx).replace(/\s+$/, "");
            return (
              <>
                {!!before && <Text style={styles.desc}>{before}</Text>}
                <FlashingText>{FLASH_LINE}</FlashingText>
              </>
            );
          })()}

          {user && (user.membership_form_completed ? (
            <View style={styles.formBadgeOk}>
              <Ionicons name="shield-checkmark" size={16} color="#22C55E" />
              <Text style={styles.formBadgeOkText}>Membership form on file</Text>
            </View>
          ) : (
            <Pressable
              testID="class-form-prompt"
              style={styles.formBadgeWarn}
              onPress={() => router.push({ pathname: "/membership", params: { next: "class" } })}
            >
              <Ionicons name="document-text-outline" size={16} color={colors.brand} />
              <Text style={styles.formBadgeWarnText}>No membership form yet — tap to complete it</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.brand} />
            </Pressable>
          ))}

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
          <Text style={styles.priceVal}>
            {cls.by_appointment && cls.appt_durations && cls.appt_durations.length > 1
              ? `from $${(Math.min(...cls.appt_durations.map((o) => o.price_cents)) / 100).toFixed(0)} AUD`
              : `$${(cls.price_cents / 100).toFixed(0)} AUD`}
          </Text>
        </View>
        <Pressable
          testID="book-and-pay-button"
          style={({ pressed }) => [styles.payBtn, isFull && styles.payBtnFull, pressed && !isFull && { opacity: 0.85 }]}
          onPress={onBookPress}
          disabled={busy || isFull}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : isFull ? (
            <Text style={styles.payBtnTextFull}>CLASS FULL</Text>
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
                <Text style={styles.apptSub}>{cls.name} · Mon–Thu, 10:30am–4:00pm</Text>
              </View>
              <Pressable testID="appt-close" onPress={() => setApptOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            {(cls.appt_durations && cls.appt_durations.length > 1) && (
              <>
                <Text style={styles.apptLabel}>SESSION LENGTH</Text>
                <View style={styles.durRow}>
                  {cls.appt_durations.map((o) => {
                    const active = apptDuration === o.minutes;
                    return (
                      <Pressable
                        key={o.minutes}
                        testID={`appt-dur-${o.minutes}`}
                        onPress={() => setApptDuration(o.minutes)}
                        style={[styles.durChip, active && styles.apptChipActive]}
                      >
                        <Text style={[styles.durMins, active && styles.apptChipTextActive]}>{o.minutes} min</Text>
                        <Text style={[styles.durPrice, active && styles.apptChipTextActive]}>${(o.price_cents / 100).toFixed(0)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ height: spacing.lg }} />
              </>
            )}

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
                      {classDate(slotIso(d, 12, 0), { weekday: "short" }).toUpperCase()}
                    </Text>
                    <Text style={[styles.apptDayNum, active && styles.apptChipTextActive]}>{d.getUTCDate()}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.apptLabel, { marginTop: spacing.lg }]}>PREFERRED TIME</Text>
            <View style={styles.apptTimeWrap}>
              {APPT_SLOTS.map(({ h, m }) => {
                const d = apptDays[apptDay];
                const iso = slotIso(d, h, m);
                const mins = h * 60 + m;
                const isTaken = takenSlots.has(iso);
                const disabled = isTaken || slotInstant(d, h, m) < Date.now() + MIN_LEAD_MS;
                const active = apptHour === mins;
                return (
                  <Pressable
                    key={mins}
                    testID={`appt-time-${mins}`}
                    disabled={disabled}
                    onPress={() => setApptHour(mins)}
                    style={[styles.apptTimeChip, active && styles.apptChipActive, disabled && styles.apptTimeDisabled, isTaken && styles.apptTimeTaken]}
                  >
                    <Text style={[styles.apptTimeText, active && styles.apptChipTextActive, disabled && styles.apptTimeTextDisabled]}>
                      {classTime(iso)}
                    </Text>
                    {isTaken && <Text style={styles.apptTakenTag}>Booked</Text>}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              testID="appt-confirm"
              style={[styles.apptConfirm, (apptHour === null || busy || ((cls.appt_durations?.length ?? 0) > 0 && apptDuration === null)) && { opacity: 0.5 }]}
              onPress={confirmAppt}
              disabled={apptHour === null || busy || ((cls.appt_durations?.length ?? 0) > 0 && apptDuration === null)}
            >
              <Text style={styles.apptConfirmText}>
                {apptDuration !== null && cls.appt_durations?.length
                  ? `CONTINUE · $${((cls.appt_durations.find((o) => o.minutes === apptDuration)?.price_cents ?? 0) / 100).toFixed(0)}`
                  : "CONTINUE TO PAYMENT"}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </Pressable>
            <Text style={styles.apptFoot}>We'll confirm your exact time after your request.</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={creditOpen} transparent animationType="fade" onRequestClose={() => setCreditOpen(false)}>
        <View style={styles.creditOverlay}>
          <View style={styles.creditCard}>
            <View style={styles.creditIcon}>
              <Ionicons name="pricetags" size={24} color={colors.brand} />
            </View>
            <Text style={styles.creditTitle}>How would you like to pay?</Text>
            <Text style={styles.creditSub}>
              {cls?.name} · ${((cls?.price_cents || 0) / 100).toFixed(2)}
            </Text>

            {passes > 0 && (
              <Pressable testID="pay-with-pass" style={styles.passPrimary} onPress={() => proceedBooking(undefined, undefined, false, true)} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="ticket" size={16} color="#fff" />
                    <Text style={styles.passPrimaryText}>Use a class pass — book free ({passes} left)</Text>
                  </>
                )}
              </Pressable>
            )}

            {credit > 0 && (
              credit >= (cls?.price_cents || 0) ? (
                <Pressable testID="credit-use-full" style={styles.creditPrimary} onPress={() => proceedBooking(undefined, undefined, true)} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                    <>
                      <Ionicons name="wallet" size={16} color={colors.onBrand} />
                      <Text style={styles.creditPrimaryText}>Use ${((cls?.price_cents || 0) / 100).toFixed(2)} credit — book free</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable testID="credit-use-partial" style={styles.creditPrimary} onPress={() => proceedBooking(undefined, undefined, true)} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                    <>
                      <Ionicons name="wallet" size={16} color={colors.onBrand} />
                      <Text style={styles.creditPrimaryText}>
                        Use ${(credit / 100).toFixed(2)} credit + pay ${(((cls?.price_cents || 0) - credit) / 100).toFixed(2)}
                      </Text>
                    </>
                  )}
                </Pressable>
              )
            )}

            <Pressable testID="credit-pay-card" style={styles.creditGhost} onPress={() => proceedBooking(undefined, undefined, false)} disabled={busy}>
              <Ionicons name="card-outline" size={16} color={colors.onSurface} />
              <Text style={styles.creditGhostText}>Pay ${((cls?.price_cents || 0) / 100).toFixed(2)} by card</Text>
            </Pressable>

            <Pressable testID="credit-cancel" onPress={() => setCreditOpen(false)} disabled={busy}>
              <Text style={styles.creditCancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  creditOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  creditCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  creditIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  creditTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "900", textAlign: "center" },
  creditSub: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6, marginBottom: spacing.lg },
  creditPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 15, borderRadius: radius.md, alignSelf: "stretch" },
  creditPrimaryText: { color: colors.onBrand, fontWeight: "900", fontSize: 14 },
  passPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22C55E", paddingVertical: 15, borderRadius: radius.md, alignSelf: "stretch", marginBottom: spacing.sm },
  passPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  creditGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignSelf: "stretch", marginTop: spacing.sm },
  creditGhostText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  creditCancel: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 13, marginTop: spacing.md },
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
  nudgeBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.warning, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  nudgeBannerText: { flex: 1, color: colors.onBrand, fontWeight: "800", fontSize: 13 },
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
  formBadgeOk: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", backgroundColor: "rgba(34,197,94,0.10)", borderWidth: 1, borderColor: "#22C55E55", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, marginTop: spacing.md },
  formBadgeOkText: { color: "#22C55E", fontSize: 12.5, fontWeight: "800" },
  formBadgeWarn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginTop: spacing.md },
  formBadgeWarnText: { color: colors.brand, fontSize: 12.5, fontWeight: "800", flex: 1 },
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
  payBtnFull: { backgroundColor: colors.surfaceTertiary },
  payBtnTextFull: { color: colors.onSurfaceSecondary, fontWeight: "900", letterSpacing: 1 },
  apptOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  apptSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: Platform.OS === "ios" ? 34 : spacing.xl, borderWidth: 1, borderColor: colors.border },
  apptHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  apptTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  apptSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  apptLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: spacing.sm },
  durRow: { flexDirection: "row", gap: spacing.md },
  durChip: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 2 },
  durMins: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  durPrice: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  apptDayChip: { width: 56, height: 66, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  apptDayLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  apptDayNum: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: 3 },
  apptChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  apptChipTextActive: { color: colors.onBrand },
  apptTimeWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  apptTimeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  apptTimeText: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  apptTimeDisabled: { opacity: 0.35 },
  apptTimeTaken: { opacity: 1, borderColor: "#EF4444", backgroundColor: "rgba(239,68,68,0.10)" },
  apptTakenTag: { color: "#EF4444", fontSize: 9, fontWeight: "800", marginTop: 1, letterSpacing: 0.3 },
  apptTimeTextDisabled: { color: colors.onSurfaceSecondary },
  apptConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.pill, marginTop: spacing.xl },
  apptConfirmText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  apptFoot: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.md },
});
