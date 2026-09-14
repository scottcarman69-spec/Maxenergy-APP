import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Modal, TextInput, KeyboardAvoidingView } from "react-native";
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
  images?: string[];
  start_at: string;
  description: string;
  level: string;
  capacity: number;
  booked?: number;
  spots_left?: number;
  by_appointment?: boolean;
  started?: boolean;
  ended?: boolean;
  appt_durations?: { minutes: number; price_cents: number }[];
  min_age?: number;
  max_age?: number;
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
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDay, setApptDay] = useState(0);
  const [apptHour, setApptHour] = useState<number | null>(null);
  const [apptDuration, setApptDuration] = useState<number | null>(null);
  const [apptChoice, setApptChoice] = useState<{ label: string; iso: string; duration?: number; priceCents: number } | null>(null);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [credit, setCredit] = useState(0);
  const [passes, setPasses] = useState(0);
  const [imgIdx, setImgIdx] = useState(0);
  const heroImages = React.useMemo(() => {
    const arr = (cls?.images || []).filter(Boolean);
    if (arr.length > 0) return arr;
    return cls?.image ? [cls.image] : [];
  }, [cls?.images, cls?.image]);
  useEffect(() => {
    setImgIdx(0);
    if (heroImages.length <= 1) return;
    const t = setInterval(() => setImgIdx((i) => (i + 1) % heroImages.length), 3500);
    return () => clearInterval(t);
  }, [heroImages]);
  const [creditOpen, setCreditOpen] = useState(false);
  const [onWaitlist, setOnWaitlist] = useState(false);
  const [wlBusy, setWlBusy] = useState(false);
  const [calReminder, setCalReminder] = useState(user?.cal_reminder_default || 60); // calendar alarm lead time (minutes)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [childAgeNum, setChildAgeNum] = useState<number | null>(null);
  const [childName, setChildName] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [savingChild, setSavingChild] = useState(false);
  const [pickerErr, setPickerErr] = useState<string | null>(null);
  // Holds the chosen child so proceedBooking always reads the committed value
  // (React state updates are async and would be stale in the same tick).
  const childRef = useRef<{ name: string; age: number | null; child_id?: string }>({ name: "", age: null });
  // child_ids (and name|age fallbacks) already booked into THIS class — so a parent
  // can't book the same child twice; they're shown disabled in the picker.
  const [bookedChildKeys, setBookedChildKeys] = useState<Set<string>>(new Set());

  const toggleWaitlist = async () => {
    if (!cls || wlBusy) return;
    setWlBusy(true);
    setMsg(null);
    try {
      if (onWaitlist) {
        await api.waitlistLeave(cls.class_id);
        setOnWaitlist(false);
        setMsg("You've left the waitlist.");
      } else {
        const r = await api.waitlistJoin(cls.class_id);
        setOnWaitlist(true);
        setMsg(`🎉 You're #${r.position} on the waitlist — we'll notify you if a spot opens.`);
      }
    } catch (e: any) {
      setMsg(e?.message || "Couldn't update the waitlist.");
    }
    setWlBusy(false);
  };

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
      const w = await api.waitlistsMe();
      setOnWaitlist((w.class_ids || []).includes(id));
    } catch {}
    // Which of my children are ALREADY booked into this class (can't book twice).
    try {
      const mb = await api.myBookings();
      const keys = new Set<string>();
      for (const b of (mb.bookings || []) as any[]) {
        if (b.class_id === id && ["paid", "pending", "confirmed", "reschedule_requested"].includes(b.status)) {
          if (b.child_id) keys.add(`id:${b.child_id}`);
          if (b.child_name) keys.add(`na:${b.child_name}|${b.child_age ?? ""}`);
        }
      }
      setBookedChildKeys(keys);
    } catch {}
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  const proceedBooking = async (requestedTime?: string, requestedAt?: string, useCredit?: boolean, useClassPass?: boolean, durationMin?: number) => {
    if (!cls) return;
    setCreditOpen(false);
    setBusy(true);
    setMsg(null);
    try {
      const { booking } = await api.createBooking(cls.class_id, requestedTime, requestedAt, durationMin, calReminder, childRef.current.age ?? undefined, childRef.current.name || undefined, childRef.current.child_id);

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

      // Fully covered by in-app credit, a class pass, or a free test account — no card payment needed.
      if (res.paid_with_credit || res.paid_with_pass || res.paid_free_test) {
        setBusy(false);
        router.replace({ pathname: "/receipt", params: { booking_id: booking.booking_id } });
        return;
      }
      // A pending Square order for this booking was actually already paid (e.g. after a refresh).
      if (res.already_paid) {
        setBusy(false);
        setMsg("This booking is already paid. See you there!");
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

  const continueFixed = () => {
    if (credit > 0 || passes > 0) {
      setMsg(null);
      setCreditOpen(true);
    } else {
      proceedBooking();
    }
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
    } else if (!!cls?.min_age && !!cls?.max_age) {
      // Kids class: always pick which child is attending (so a parent can book more
      // than one child into the same class). The same child is blocked in the picker.
      const kids = user?.children || [];
      setPickerErr(null);
      setAddOpen(kids.length === 0);
      setNewName("");
      setNewAge("");
      setMsg(null);
      setPickerOpen(true);
    } else {
      continueFixed();
    }
  };

  const selectChild = (name: string, age: number, child_id?: string) => {
    childRef.current = { name, age, child_id };
    setChildName(name);
    setChildAgeNum(age);
    setPickerOpen(false);
    continueFixed();
  };

  const saveNewChild = async () => {
    const n = newName.trim();
    const a = parseInt(newAge, 10);
    if (!n) { setPickerErr("Please enter the child's name."); return; }
    if (!Number.isFinite(a) || a < 1 || a > 100) { setPickerErr("Please enter a valid age."); return; }
    if (cls?.min_age && a < cls.min_age) {
      setPickerErr(`Sorry, ${cls.name} is for ages ${cls.min_age}+. ${n} is too young to be booked in.`);
      return;
    }
    setSavingChild(true); setPickerErr(null);
    try {
      const r = await api.addChild(n, a);
      await refresh();
      // Grab the id of the child we just added so the booking dedupes per-child.
      const added = (r.children || []).filter((c) => c.name === n && c.age === a).pop();
      selectChild(n, a, added?.child_id);
    } catch (e: any) {
      setPickerErr(e?.message || "Couldn't save the child. Please try again.");
    }
    setSavingChild(false);
  };

  // Preferred-time picker (appointment classes): Mon–Thu only, 10:30am–4:00pm (Queensland).
  // Members can book any listed slot; only genuinely past times are disabled.
  const MIN_LEAD_MS = 0;
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
    const priceCents = (apptDuration != null && cls?.appt_durations?.length)
      ? (cls.appt_durations.find((o) => o.minutes === apptDuration)?.price_cents ?? cls.price_cents)
      : (cls?.price_cents ?? 0);
    setApptOpen(false);
    // If the member has passes or credit, let them choose how to pay; otherwise go straight to card.
    if (passes > 0 || credit > 0) {
      setApptChoice({ label, iso, duration: apptDuration ?? undefined, priceCents });
      setMsg(null);
      setCreditOpen(true);
    } else {
      proceedBooking(label, iso, undefined, undefined, apptDuration ?? undefined);
    }
  };

  // Unified pay handler used by the payment popup (handles both fixed classes and appointments).
  const payWith = (useCredit?: boolean, usePass?: boolean) => {
    if (apptChoice) {
      proceedBooking(apptChoice.label, apptChoice.iso, useCredit, usePass, apptChoice.duration);
    } else {
      proceedBooking(undefined, undefined, useCredit, usePass);
    }
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

  const payPrice = apptChoice ? apptChoice.priceCents : (cls.price_cents || 0);

  const isFull = !cls.by_appointment && cls.spots_left === 0;
  const closed = !cls.by_appointment && !!cls.started;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.hero}>
          <Image
            source={heroImages[imgIdx] || cls.image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={700}
          />
          <LinearGradient
            colors={["rgba(18,18,20,0.55)", "transparent", "rgba(18,18,20,0.95)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          {heroImages.length > 1 && (
            <View style={styles.dotsRow} pointerEvents="none">
              {heroImages.map((_, i) => (
                <View key={i} style={[styles.dot, i === imgIdx && styles.dotActive]} />
              ))}
            </View>
          )}
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
          {!!cls.min_age && (
            <View style={styles.ageBanner}>
              <View style={styles.ageIconWrap}>
                <Ionicons name="body" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                {cls.max_age ? (
                  <>
                    <Text style={styles.ageBannerTitle}>Ages {cls.min_age}–{cls.max_age} only</Text>
                    <Text style={styles.ageBannerSub}>This class is for children aged {cls.min_age} to {cls.max_age} years.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.ageBannerTitle}>Ages {cls.min_age}+</Text>
                    <Text style={styles.ageBannerSub}>This class is for ages {cls.min_age} and over.</Text>
                  </>
                )}
              </View>
            </View>
          )}
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
              style={styles.joinNotice}
              onPress={() => router.push({ pathname: "/membership", params: { next: "class" } })}
            >
              <View style={styles.joinIcon}>
                <Ionicons name="document-text-outline" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.joinTitle}>Complete your membership form</Text>
                <Text style={styles.joinBody}>Fill out your membership form to book classes. Tap here to complete it.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brand} />
            </Pressable>
          ))}

          {!!(cls as any).program && (
            <View style={styles.programBanner}>
              <Ionicons name="school" size={18} color={colors.brand} />
              <Text style={styles.programBannerText}>
                {(cls as any).program} · runs each school term. Enrol via Membership for the full term.
              </Text>
            </View>
          )}

          {!cls.by_appointment && (
            <View style={styles.reminderCard}>
              <View style={styles.reminderHead}>
                <Ionicons name="notifications-outline" size={16} color={colors.brand} />
                <Text style={styles.reminderTitle}>Calendar reminder</Text>
              </View>
              <Text style={styles.reminderSub}>When should your calendar remind you before class?</Text>
              <View style={styles.reminderRow}>
                {[{ m: 60, label: "1 hour before" }, { m: 1440, label: "1 day before" }].map((o) => {
                  const active = calReminder === o.m;
                  return (
                    <Pressable
                      key={o.m}
                      testID={`cal-reminder-${o.m}`}
                      style={[styles.reminderChip, active && styles.reminderChipActive]}
                      onPress={() => setCalReminder(o.m)}
                    >
                      <Text style={[styles.reminderChipText, active && styles.reminderChipTextActive]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
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
          style={({ pressed }) => [styles.payBtn, closed && styles.payBtnFull, isFull && !onWaitlist && styles.payBtnWaitlist, isFull && onWaitlist && styles.payBtnFull, pressed && !closed && { opacity: 0.85 }]}
          onPress={closed ? undefined : isFull ? toggleWaitlist : onBookPress}
          disabled={busy || wlBusy || closed}
        >
          {busy || wlBusy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : closed ? (
            <>
              <Ionicons name="lock-closed" size={16} color={colors.onSurfaceSecondary} />
              <Text style={styles.payBtnTextFull}>BOOKINGS CLOSED · CLASS STARTED</Text>
            </>
          ) : isFull ? (
            onWaitlist ? (
              <>
                <Ionicons name="checkmark-circle" size={17} color={colors.onSurfaceSecondary} />
                <Text style={styles.payBtnTextFull}>ON WAITLIST · TAP TO LEAVE</Text>
              </>
            ) : (
              <>
                <Ionicons name="notifications" size={17} color={colors.onBrand} />
                <Text style={styles.payBtnText}>JOIN WAITLIST</Text>
              </>
            )
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
                <Text style={styles.apptTitle}>Book your session</Text>
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
            <Text style={styles.apptFoot}>Pay now to reserve — your booking is approved once the gym confirms your time.</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.creditOverlay}>
          <View style={styles.creditCard}>
            <View style={styles.creditIcon}>
              <Ionicons name="people-circle" size={26} color={colors.brand} />
            </View>
            <Text style={styles.ageModalTitle}>Who's attending?</Text>
            <Text style={styles.ageModalSub}>
              This class is designed for ages {cls?.min_age}–{cls?.max_age}.
            </Text>

            {!addOpen && (
              <View style={{ alignSelf: "stretch", marginTop: spacing.md, gap: spacing.sm }}>
                {(user?.children || []).map((c) => {
                  const tooYoung = !!cls?.min_age && c.age < cls.min_age;
                  const tooOld = !!cls?.max_age && c.age > cls.max_age;
                  const alreadyBooked = bookedChildKeys.has(`id:${c.child_id}`) || bookedChildKeys.has(`na:${c.name}|${c.age}`);
                  const disabled = tooYoung || alreadyBooked;
                  return (
                    <Pressable
                      key={c.child_id}
                      testID={`pick-child-${c.child_id}`}
                      disabled={disabled}
                      onPress={() => selectChild(c.name, c.age, c.child_id)}
                      style={[styles.childRow, disabled && styles.childRowDisabled]}
                    >
                      <View style={styles.childAvatar}><Text style={styles.childAvatarText}>{c.name.slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.childName}>{c.name}</Text>
                        <Text style={[styles.childAge, tooYoung && { color: colors.error }, tooOld && !tooYoung && { color: colors.warning }, alreadyBooked && !tooYoung && { color: colors.success }]}>
                          {c.age} years{alreadyBooked ? " · already booked in this class" : tooYoung ? ` · too young (ages ${cls?.min_age}+)` : tooOld ? " · above usual age range" : ""}
                        </Text>
                      </View>
                      {alreadyBooked ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : !tooYoung && <Ionicons name="chevron-forward" size={18} color={colors.brand} />}
                    </Pressable>
                  );
                })}
                <Pressable testID="picker-add-toggle" style={styles.addChildBtn} onPress={() => { setAddOpen(true); setPickerErr(null); }}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
                  <Text style={styles.addChildBtnText}>Add another child</Text>
                </Pressable>
              </View>
            )}

            {addOpen && (
              <View style={{ alignSelf: "stretch", marginTop: spacing.md }}>
                <TextInput
                  testID="new-child-name"
                  style={styles.ageInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Child's name"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  maxLength={40}
                  autoFocus
                />
                <TextInput
                  testID="new-child-age"
                  style={[styles.ageInput, { marginTop: spacing.sm }]}
                  value={newAge}
                  onChangeText={(t) => setNewAge(t.replace(/[^0-9]/g, "").slice(0, 3))}
                  keyboardType="number-pad"
                  placeholder="Age in years"
                  placeholderTextColor={colors.onSurfaceSecondary}
                  maxLength={3}
                />
                {pickerErr && (
                  <View style={styles.ageBlock}>
                    <Ionicons name="close-circle" size={15} color={colors.error} />
                    <Text style={styles.ageBlockText}>{pickerErr}</Text>
                  </View>
                )}
                <Pressable
                  testID="new-child-save"
                  style={[styles.payBtn, { marginTop: spacing.md, justifyContent: "center", opacity: savingChild ? 0.6 : 1 }]}
                  onPress={saveNewChild}
                  disabled={savingChild}
                >
                  {savingChild ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.payBtnText}>SAVE & CONTINUE</Text>}
                </Pressable>
                {(user?.children || []).length > 0 && (
                  <Pressable testID="picker-back" style={styles.ageCancel} onPress={() => { setAddOpen(false); setPickerErr(null); }}>
                    <Text style={styles.ageCancelText}>Back to my children</Text>
                  </Pressable>
                )}
              </View>
            )}

            <Pressable testID="picker-cancel" style={styles.ageCancel} onPress={() => setPickerOpen(false)}>
              <Text style={styles.ageCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={creditOpen} transparent animationType="fade" onRequestClose={() => { setCreditOpen(false); setApptChoice(null); }}>
        <View style={styles.creditOverlay}>
          <View style={styles.creditCard}>
            <View style={styles.creditIcon}>
              <Ionicons name="pricetags" size={24} color={colors.brand} />
            </View>
            <Text style={styles.creditTitle}>How would you like to pay?</Text>
            <Text style={styles.creditSub}>
              {cls?.name}{apptChoice ? ` · ${apptChoice.label}` : ""} · ${(payPrice / 100).toFixed(2)}
            </Text>

            {passes === 0 && credit > 0 && credit < payPrice && (
              <View style={styles.lowBalBox}>
                <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                <Text style={styles.lowBalText}>
                  Your ${(credit / 100).toFixed(2)} credit won't fully cover this ${(payPrice / 100).toFixed(2)} {apptChoice ? "session" : "class"} — you'll pay the remaining ${((payPrice - credit) / 100).toFixed(2)} by card.
                </Text>
              </View>
            )}

            {passes > 0 && (
              <Pressable testID="pay-with-pass" style={styles.passPrimary} onPress={() => payWith(false, true)} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="ticket" size={16} color="#fff" />
                    <Text style={styles.passPrimaryText}>Use a class pass — book free ({passes} left)</Text>
                  </>
                )}
              </Pressable>
            )}

            {credit > 0 && (
              credit >= payPrice ? (
                <Pressable testID="credit-use-full" style={styles.creditPrimary} onPress={() => payWith(true)} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                    <>
                      <Ionicons name="wallet" size={16} color={colors.onBrand} />
                      <Text style={styles.creditPrimaryText}>Use ${(payPrice / 100).toFixed(2)} credit — book free</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable testID="credit-use-partial" style={styles.creditPrimary} onPress={() => payWith(true)} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.onBrand} /> : (
                    <>
                      <Ionicons name="wallet" size={16} color={colors.onBrand} />
                      <Text style={styles.creditPrimaryText}>
                        Use ${(credit / 100).toFixed(2)} credit + pay ${((payPrice - credit) / 100).toFixed(2)}
                      </Text>
                    </>
                  )}
                </Pressable>
              )
            )}

            <Pressable testID="credit-pay-card" style={styles.creditGhost} onPress={() => payWith(false)} disabled={busy}>
              <Ionicons name="card-outline" size={16} color={colors.onSurface} />
              <Text style={styles.creditGhostText}>Pay ${(payPrice / 100).toFixed(2)} by card</Text>
            </Pressable>

            <Pressable testID="credit-cancel" onPress={() => { setCreditOpen(false); setApptChoice(null); }} disabled={busy}>
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
  lowBalBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "#F59E0B", borderRadius: radius.md, padding: spacing.md, alignSelf: "stretch", marginBottom: spacing.md },
  lowBalText: { flex: 1, color: colors.onSurface, fontSize: 12.5, lineHeight: 18 },
  creditPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 15, borderRadius: radius.md, alignSelf: "stretch" },
  creditPrimaryText: { color: colors.onBrand, fontWeight: "900", fontSize: 14 },
  passPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22C55E", paddingVertical: 15, borderRadius: radius.md, alignSelf: "stretch", marginBottom: spacing.sm },
  passPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  creditGhost: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignSelf: "stretch", marginTop: spacing.sm },
  creditGhostText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  creditCancel: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 13, marginTop: spacing.md },
  hero: { height: 380, justifyContent: "flex-end" },
  dotsRow: { position: "absolute", top: 52, right: spacing.xl, flexDirection: "row", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" },
  dotActive: { backgroundColor: colors.primary, width: 18 },
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
  ageBanner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  ageIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ageBannerTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "900" },
  ageBannerSub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  ageModalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900", textAlign: "center", marginTop: 4 },
  ageModalSub: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6 },
  ageInput: { marginTop: spacing.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  ageWarn: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.warning + "1F", borderRadius: radius.md, padding: 10, marginTop: spacing.md },
  ageWarnText: { flex: 1, color: colors.onSurface, fontSize: 12.5, lineHeight: 18 },
  ageBlock: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.error + "1F", borderRadius: radius.md, padding: 10, marginTop: spacing.md },
  ageBlockText: { flex: 1, color: colors.error, fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  ageCancel: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  ageCancelText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  childRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md },
  childRowDisabled: { opacity: 0.5 },
  childAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  childAvatarText: { color: colors.onBrand, fontSize: 16, fontWeight: "900" },
  childName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  childAge: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  addChildBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", marginTop: 2 },
  addChildBtnText: { color: colors.brand, fontWeight: "800", fontSize: 14 },
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
  reminderCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  reminderHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  reminderTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  reminderSub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 4, marginBottom: spacing.sm },
  reminderRow: { flexDirection: "row", gap: spacing.sm },
  reminderChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  reminderChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  reminderChipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  reminderChipTextActive: { color: colors.brand, fontWeight: "900" },
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
  payBtnWaitlist: { backgroundColor: "#F59E0B" },
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
