import React, { useCallback, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, classStartMs, qldTodayUTC, qldNowUTC, stampDate, stampTime } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";
import { addBookingToCalendar } from "@/src/utils/calendar";

type Booking = { booking_id: string; class_name: string; status: string; amount: number; by_appointment?: boolean; is_trial?: boolean; requested_time?: string; requested_at?: string; scheduled_time?: string; proposed_time?: string; class_start?: string; duration_min?: number; attended?: boolean; checked_in_method?: string; checked_in_by?: string; checked_in_at?: string; paid_with_pass?: boolean };
type ClassSlot = { class_id: string; name: string; start_at: string; spots_left?: number; capacity?: number };

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: "PAID", bg: colors.brand, fg: colors.onBrand },
  confirmed: { label: "CONFIRMED", bg: colors.brand, fg: colors.onBrand },
  pending: { label: "PENDING", bg: colors.surfaceTertiary, fg: colors.onSurface },
  reschedule_requested: { label: "RESCHEDULE REQUESTED", bg: colors.surfaceTertiary, fg: colors.onSurface },
  admin_proposed: { label: "NEW TIME PROPOSED", bg: "#F59E0B", fg: "#1A1A1A" },
  cancelled: { label: "CANCELLED", bg: colors.surfaceTertiary, fg: colors.onSurfaceSecondary },
};

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [creditCents, setCreditCents] = useState(0);
  const [passCredits, setPassCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<Booking | null>(null);
  const [cancelFor, setCancelFor] = useState<Booking | null>(null);
  const [rDay, setRDay] = useState("");   // appointment: selected day key (UTC YYYY-MM-DD)
  const [rSlot, setRSlot] = useState(""); // appointment: selected minutes-since-midnight (string)
  const [rNote, setRNote] = useState("");
  const [rErr, setRErr] = useState<string | null>(null);
  const [classSlots, setClassSlots] = useState<ClassSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [rClassSlot, setRClassSlot] = useState<ClassSlot | null>(null);
  const [takenSlots, setTakenSlots] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [cancelWindow, setCancelWindow] = useState(24);
  const [calBusy, setCalBusy] = useState<string | null>(null);

  const addToCalendar = async (b: Booking) => {
    setCalBusy(b.booking_id);
    setBanner(null);
    const r = await addBookingToCalendar(b.booking_id);
    setBanner(r.message);
    setCalBusy(null);
    setTimeout(() => setBanner(null), 3500);
  };

  const isAppt = !!rescheduleFor?.by_appointment;

  // For appointment bookings, load which PT/Program slots are already taken.
  useEffect(() => {
    if (!rescheduleFor || !rescheduleFor.by_appointment) { setTakenSlots(new Set()); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.appointmentsTaken();
        // Exclude this booking's own current slot — the member is moving away from it.
        const own = rescheduleFor.requested_at || "";
        if (!cancelled) setTakenSlots(new Set((r.taken || []).filter((t: string) => t !== own)));
      } catch { if (!cancelled) setTakenSlots(new Set()); }
    })();
    return () => { cancelled = true; };
  }, [rescheduleFor]);

  // For class bookings, load the gym's real upcoming sessions (24h+ out, same class first).
  useEffect(() => {
    if (!rescheduleFor || rescheduleFor.by_appointment) { setClassSlots([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const r = await api.classes();
        const cutoff = Date.now() + cancelWindow * 3600 * 1000;
        const all: ClassSlot[] = (r.classes || [])
          .filter((c: any) => c.start_at && classStartMs(c.start_at) > cutoff)
          .sort((a: any, b: any) => classStartMs(a.start_at) - classStartMs(b.start_at))
          .map((c: any) => ({ class_id: c.class_id, name: c.name, start_at: c.start_at, spots_left: c.spots_left, capacity: c.capacity }));
        const sameName = all.filter((c) => c.name === rescheduleFor.class_name);
        if (!cancelled) setClassSlots(sameName.length ? sameName : all);
      } catch { if (!cancelled) setClassSlots([]); }
      if (!cancelled) setLoadingSlots(false);
    })();
    return () => { cancelled = true; };
  }, [rescheduleFor, cancelWindow]);

  // Appointment reschedule: Mon–Thu days only (next ~3 weeks).
  const dayOptions = React.useMemo(() => {
    const base = qldTodayUTC();
    const out: { key: string; short: string; full: string; date: Date }[] = [];
    for (let i = 0; i < 21 && out.length < 10; i++) {
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
      const wd = d.getUTCDay();
      if (!(wd >= 1 && wd <= 4)) continue; // Mon–Thu only
      out.push({
        key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
        short: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
        full: d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }),
        date: d,
      });
    }
    return out;
  }, [rescheduleFor]);
  // Appointment slots: 10:30am–4:00pm on the half hour.
  const timeSlots = React.useMemo(() => {
    const out: { v: string; mins: number; label: string }[] = [];
    for (let mins = 10 * 60 + 30; mins <= 16 * 60; mins += 30) {
      const h = Math.floor(mins / 60), m = mins % 60;
      const label = new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
      out.push({ v: String(mins), mins, label });
    }
    return out;
  }, []);
  const slotIsoFor = (dayKey: string, mins: number) => {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${dayKey}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  };
  const nowIso = () => {
    const n = qldNowUTC();
    return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}T${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}:00`;
  };
  const rDayFull = dayOptions.find((d) => d.key === rDay)?.full || "";
  const rSlotLabel = timeSlots.find((s) => s.v === rSlot)?.label || "";
  const rApptIso = rDay && rSlot ? slotIsoFor(rDay, Number(rSlot)) : "";
  const slotLabel = (c: ClassSlot) => `${classDate(c.start_at, { weekday: "short", day: "numeric", month: "short" })} · ${classTime(c.start_at)}`;
  const rComposed = isAppt
    ? (rDayFull && rSlotLabel ? `${rDayFull} · ${rSlotLabel}` : "")
    : (rClassSlot ? `${rClassSlot.name} · ${slotLabel(rClassSlot)}` : "");

  const load = useCallback(async () => {
    try {
      const b = await api.myBookings();
      setBookings(b.bookings || []);
    } catch {}
    try {
      const c = await api.myCredits();
      setCreditCents(c.balance_cents || 0);
      setPassCredits(c.class_pass_credits || 0);
    } catch {}
    try {
      const s = await api.bookingSettings();
      if (typeof s.cancel_window_hours === "number") setCancelWindow(s.cancel_window_hours);
    } catch {}
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const doCancel = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      const res = await api.cancelBooking(b.booking_id);
      const bk = res?.booking || {};
      let extra = "";
      if (bk.cancel_reward === "class_pass") extra = " Your class pass has been returned to your account.";
      else if (bk.cancel_reward === "credit" && bk.cancel_credit_cents)
        extra = ` $${(bk.cancel_credit_cents / 100).toFixed(2)} credit added to your account.`;
      setCancelFor(null);
      setBanner("Booking cancelled." + extra + " We've notified the gym.");
      await load();
    } catch (e: any) {
      const msg = e?.message || "Could not cancel booking.";
      setCancelFor(null);
      setBanner(msg);
    }
    setActioning(null);
  };

  const confirmCancel = (b: Booking) => setCancelFor(b);

  const confirmProposed = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      await api.confirmProposedTime(b.booking_id);
      setBanner("Great! Your session time is confirmed.");
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not confirm the time.");
    }
    setActioning(null);
  };

  const submitReschedule = async () => {
    if (!rescheduleFor || !rComposed) return;
    setRErr(null);
    setActioning(rescheduleFor.booking_id);
    const newAt = isAppt ? rApptIso : (rClassSlot?.start_at || undefined);
    try {
      await api.rescheduleBooking(rescheduleFor.booking_id, rComposed, rNote.trim() || undefined, newAt || undefined);
      setBanner("Reschedule request sent. The gym will confirm a time.");
      setRescheduleFor(null);
      setRDay(""); setRSlot(""); setRNote(""); setRClassSlot(null);
      await load();
    } catch (e: any) {
      setRErr(e?.message || "Could not request reschedule. Please try again.");
    }
    setActioning(null);
  };

  const clearBooking = (id: string) => {
    setBookings((cur) => cur.filter((x) => x.booking_id !== id));
    api.clearBooking(id).catch(() => {});
  };

  const clearAllBookings = async () => {
    setBookings([]);
    setBanner("Bookings cleared. You can still view them in your log.");
    try { await api.clearAllBookings(); } catch {}
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="My Bookings"
        backTestID="bookings-back"
        fallback="/(tabs)/profile"
        right={
          <Pressable testID="booking-history" style={styles.logBtn} onPress={() => router.push("/booking-history")}>
            <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} />
            <Text style={styles.logBtnText}>Log</Text>
          </Pressable>
        }
      />

      {banner && (
        <Pressable testID="bookings-banner" style={styles.banner} onPress={() => setBanner(null)}>
          <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
        >
          <Pressable testID="bookings-wallet" style={styles.walletBar} onPress={() => router.push("/credits")}>
            <View style={styles.walletCol}>
              <View style={styles.walletHead}>
                <Ionicons name="wallet-outline" size={15} color={colors.brand} />
                <Text style={styles.walletLabel}>CREDIT</Text>
              </View>
              <Text style={styles.walletValue}>${(creditCents / 100).toFixed(2)}</Text>
            </View>
            <View style={styles.walletDivider} />
            <View style={styles.walletCol}>
              <View style={styles.walletHead}>
                <Ionicons name="ticket-outline" size={15} color="#22C55E" />
                <Text style={styles.walletLabel}>PASSES</Text>
              </View>
              <Text style={styles.walletValue}>{passCredits}</Text>
            </View>
            <View style={styles.walletCta}>
              <Text style={styles.walletCtaText}>History</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceSecondary} />
            </View>
          </Pressable>

          {bookings.length > 0 && (
            <View style={styles.topRow}>
              <Text style={styles.countText}>{bookings.length} booking{bookings.length === 1 ? "" : "s"}</Text>
              <Pressable testID="booking-clear-all" style={styles.sectionBtn} onPress={clearAllBookings}>
                <Ionicons name="trash-outline" size={14} color={colors.brand} />
                <Text style={[styles.sectionBtnText, { color: colors.brand }]}>Clear all</Text>
              </Pressable>
            </View>
          )}

          {bookings.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptyText}>Head to the Schedule to book your first class.</Text>
              <Pressable testID="bookings-browse" style={styles.browseBtn} onPress={() => router.replace("/(tabs)/timetable")}>
                <Text style={styles.browseBtnText}>Browse classes</Text>
              </Pressable>
            </View>
          ) : (
            bookings.map((b) => {
              const meta = STATUS_META[b.status] || { label: b.status.toUpperCase(), bg: colors.surfaceTertiary, fg: colors.onSurface };
              const canManage = b.status !== "cancelled" && !b.is_trial;
              // "No-show": paid/confirmed, never checked in, and the session end time has passed.
              const startIso = b.by_appointment ? b.requested_at : b.class_start;
              const endMs = startIso ? classStartMs(startIso) + ((b.duration_min || 60) * 60000) : NaN;
              const missed = !b.attended && (b.status === "paid" || b.status === "confirmed")
                && !Number.isNaN(endMs) && qldNowUTC().getTime() > endMs;
              return (
                <Swipeable
                  key={b.booking_id}
                  renderRightActions={() => (
                    <Pressable testID={`booking-clear-${b.booking_id}`} style={styles.notifDelete} onPress={() => clearBooking(b.booking_id)}>
                      <Ionicons name="trash" size={20} color="#fff" />
                      <Text style={styles.notifDeleteText}>Clear</Text>
                    </Pressable>
                  )}
                  onSwipeableOpen={(direction) => { if (direction === "right") clearBooking(b.booking_id); }}
                  overshootRight={false}
                  rightThreshold={40}
                >
                  <View style={styles.bookingCard}>
                    <View style={styles.cardTopSection}>
                    <View style={styles.bookingRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notifTitle}>{b.class_name}</Text>
                        {(() => {
                          const timeLabel = b.by_appointment
                            ? (b.scheduled_time || b.requested_time || "By appointment")
                            : (b.class_start ? `${classDate(b.class_start, { weekday: "short", day: "numeric", month: "short" })} · ${classTime(b.class_start)}` : "Time TBC");
                          return (
                            <View style={styles.timeRow}>
                              <Ionicons name="time-outline" size={13} color={colors.brand} />
                              <Text style={styles.timeRowText}>{timeLabel}</Text>
                            </View>
                          );
                        })()}
                        <Text style={styles.notifBody}>
                          {b.by_appointment ? "By appointment" : `$${(b.amount / 100).toFixed(0)}`}
                          {b.status === "reschedule_requested" && b.requested_time ? ` · asked: ${b.requested_time}` : ""}
                          {b.status === "admin_proposed" && b.proposed_time ? ` · proposed: ${b.proposed_time}` : ""}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
                      </View>
                    </View>
                    {b.status === "confirmed" && (
                      <View style={styles.confirmedBanner}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Text style={styles.confirmedBannerText}>Booking confirmed by Maxenergy</Text>
                      </View>
                    )}
                    {b.status === "admin_proposed" && (
                      <View style={styles.proposeBox}>
                        <Text style={styles.proposeText}>
                          The gym proposed a new time{b.proposed_time ? `: ${b.proposed_time}` : ""}. Does this suit you?
                        </Text>
                        <Pressable
                          testID={`booking-confirm-time-${b.booking_id}`}
                          style={styles.proposeConfirmBtn}
                          onPress={() => confirmProposed(b)}
                          disabled={actioning === b.booking_id}
                        >
                          {actioning === b.booking_id ? (
                            <ActivityIndicator size="small" color={colors.onBrand} />
                          ) : (
                            <>
                              <Ionicons name="checkmark-circle" size={16} color={colors.onBrand} />
                              <Text style={styles.proposeConfirmText}>This time works</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                    {b.status === "reschedule_requested" && (
                      <View style={styles.pendingBox}>
                        <Ionicons name="hourglass-outline" size={15} color={colors.brand} />
                        <Text style={styles.pendingText}>
                          Reschedule requested{b.requested_time ? ` for ${b.requested_time}` : ""} — waiting for the gym to confirm. You can't request another change until they respond.
                        </Text>
                      </View>
                    )}
                    </View>
                    {canManage && (
                      <View style={styles.bookingActions}>
                        {b.status !== "reschedule_requested" && (
                          <Pressable
                            testID={`booking-reschedule-${b.booking_id}`}
                            style={styles.actionBtnGhost}
                            onPress={() => { setRescheduleFor(b); setRDay(""); setRSlot(""); setRNote(""); setRClassSlot(null); setRErr(null); }}
                            disabled={actioning === b.booking_id}
                          >
                            <Ionicons name="time-outline" size={15} color={colors.brand} />
                            <Text style={styles.actionGhostText}>Reschedule</Text>
                          </Pressable>
                        )}
                        <Pressable
                          testID={`booking-cancel-${b.booking_id}`}
                          style={styles.actionBtnDanger}
                          onPress={() => confirmCancel(b)}
                          disabled={actioning === b.booking_id}
                        >
                          {actioning === b.booking_id ? (
                            <ActivityIndicator size="small" color={colors.error} />
                          ) : (
                            <>
                              <Ionicons name="close-circle-outline" size={15} color={colors.error} />
                              <Text style={styles.actionDangerText}>Cancel</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    )}
                    {(b.status === "paid" || b.status === "confirmed") && !b.is_trial && (
                      <Pressable
                        testID={`booking-receipt-${b.booking_id}`}
                        style={styles.receiptBtn}
                        onPress={() => router.push({ pathname: "/receipt", params: { booking_id: b.booking_id } })}
                      >
                        <Ionicons name="receipt-outline" size={15} color={colors.brand} />
                        <Text style={styles.receiptBtnText}>View receipt</Text>
                      </Pressable>
                    )}
                    {(b.status === "paid" || b.status === "confirmed") && !b.is_trial && !!startIso
                      && !Number.isNaN(endMs) && qldNowUTC().getTime() < endMs && (
                      <Pressable
                        testID={`booking-calendar-${b.booking_id}`}
                        style={styles.receiptBtn}
                        onPress={() => addToCalendar(b)}
                        disabled={calBusy === b.booking_id}
                      >
                        {calBusy === b.booking_id ? (
                          <ActivityIndicator size="small" color={colors.brand} />
                        ) : (
                          <>
                            <Ionicons name="calendar-outline" size={15} color={colors.brand} />
                            <Text style={styles.receiptBtnText}>Add to calendar</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                    {(b.status === "paid" || b.status === "confirmed") && (
                      b.attended ? (
                        <View style={styles.attendCard}>
                          <View style={styles.attendHead}>
                            <Ionicons name="checkmark-circle" size={18} color="#fff" />
                            <Text style={styles.attendHeadText}>ATTENDANCE CONFIRMED</Text>
                          </View>
                          <View style={styles.attendBody}>
                            <View style={styles.attendRow}>
                              <Text style={styles.attendLabel}>Method</Text>
                              <Text style={styles.attendValue}>{b.checked_in_method === "manual" ? "Staff (manual)" : "QR Code"}</Text>
                            </View>
                            {!!b.checked_in_by && (
                              <View style={styles.attendRow}>
                                <Text style={styles.attendLabel}>Confirmed by</Text>
                                <Text style={styles.attendValue}>{b.checked_in_by}</Text>
                              </View>
                            )}
                            {!!b.checked_in_at && (
                              <View style={styles.attendRow}>
                                <Text style={styles.attendLabel}>Confirmed</Text>
                                <Text style={styles.attendValue}>{stampDate(b.checked_in_at, { weekday: "short", day: "numeric", month: "short" })} · {stampTime(b.checked_in_at)}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      ) : missed ? (
                        <View style={styles.missedBar}>
                          <Ionicons name="alert-circle" size={16} color={colors.error} />
                          <Text style={styles.missedText}>QR code was not confirmed during class time</Text>
                        </View>
                      ) : (
                        <Pressable
                          testID={`booking-qr-${b.booking_id}`}
                          style={styles.qrInfoBar}
                          onPress={() => router.push({ pathname: "/check-in", params: { booking_id: b.booking_id } })}
                        >
                          <Ionicons name="qr-code" size={16} color={colors.brand} />
                          <Text style={styles.qrInfoText}>Show entry QR code</Text>
                          <Ionicons name="chevron-forward" size={15} color={colors.brand} />
                        </Pressable>
                      )
                    )}
                  </View>
                </Swipeable>
              );
            })
          )}
          {bookings.length > 0 && <Text style={styles.swipeHint}>Swipe a booking left to clear it</Text>}
        </ScrollView>
      )}

      <Modal visible={!!rescheduleFor} transparent animationType="fade" onRequestClose={() => setRescheduleFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 4 }}>
            <Text style={styles.modalTitle}>Request a reschedule</Text>
            <Text style={styles.modalSub}>{rescheduleFor?.class_name}</Text>
            <Text style={styles.modalHint}>Reschedules must be at least {cancelWindow} hour{cancelWindow === 1 ? "" : "s"} before your booking.</Text>

            {isAppt ? (
              <>
                <Text style={styles.modalLabel}>Pick a day (Mon–Thu)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {dayOptions.map((d) => {
                    const on = rDay === d.key;
                    return (
                      <Pressable key={d.key} testID={`rday-${d.key}`} style={[styles.pickChip, on && styles.pickChipOn]} onPress={() => { setRDay(d.key); setRSlot(""); }}>
                        <Text style={[styles.pickChipText, on && styles.pickChipTextOn]}>{d.short}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <Text style={styles.modalLabel}>Pick a time (10:30am–4:00pm)</Text>
                {!rDay ? (
                  <Text style={styles.modalHint}>Choose a day first to see available times.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                    {timeSlots.map((s) => {
                      const iso = slotIsoFor(rDay, s.mins);
                      const cutoff = (() => { const n = qldNowUTC(); n.setUTCHours(n.getUTCHours() + cancelWindow); return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}T${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}:00`; })();
                      const tooSoon = iso <= cutoff;
                      const taken = takenSlots.has(iso);
                      const disabled = tooSoon || taken;
                      const on = rSlot === s.v;
                      return (
                        <Pressable
                          key={s.v}
                          testID={`rslot-${s.v}`}
                          disabled={disabled}
                          style={[styles.pickChip, on && styles.pickChipOn, disabled && { opacity: 0.35 }, taken && styles.pickChipTaken]}
                          onPress={() => setRSlot(s.v)}
                        >
                          <Text style={[styles.pickChipText, on && styles.pickChipTextOn]}>{s.label}</Text>
                          {taken && <Text style={styles.pickChipTakenText}>booked</Text>}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalLabel}>Pick a session</Text>
                {loadingSlots ? (
                  <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} />
                ) : classSlots.length === 0 ? (
                  <Text style={styles.modalHint}>No upcoming sessions {cancelWindow}h+ away. Please contact the gym.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator>
                    {classSlots.map((c) => {
                      const on = rClassSlot?.class_id === c.class_id && rClassSlot?.start_at === c.start_at;
                      const spots = typeof c.spots_left === "number" ? c.spots_left : undefined;
                      const full = spots === 0;
                      const low = spots !== undefined && spots > 0 && spots <= 3;
                      return (
                        <Pressable key={`${c.class_id}-${c.start_at}`} testID={`rclass-${c.class_id}`} disabled={full} style={[styles.slotRow, on && styles.slotRowOn, full && { opacity: 0.45 }]} onPress={() => !full && setRClassSlot(c)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.slotName}>{c.name}</Text>
                            <Text style={styles.slotWhen}>{classDate(c.start_at, { weekday: "long", day: "numeric", month: "short" })} · {classTime(c.start_at)}</Text>
                            {spots !== undefined && (
                              <Text style={[styles.slotSpots, full ? { color: colors.error } : low ? { color: "#F59E0B" } : { color: "#22C55E" }]}>
                                {full ? "Class full" : `${spots} spot${spots === 1 ? "" : "s"} left`}
                              </Text>
                            )}
                          </View>
                          {on && <Ionicons name="checkmark-circle" size={20} color={colors.brand} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {!!rComposed && <Text style={styles.rComposed}>Preferred: {rComposed}</Text>}

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              testID="reschedule-note"
              value={rNote}
              onChangeText={setRNote}
              placeholder="Anything the gym should know"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              style={[styles.modalInput, { minHeight: 70, textAlignVertical: "top" }]}
            />
            {!!rErr && (
              <View style={styles.errBox} testID="reschedule-error">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errBoxText}>{rErr}</Text>
              </View>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setRescheduleFor(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="reschedule-submit"
                style={[styles.modalSubmit, (!rComposed || !!actioning) && { opacity: 0.5 }]}
                onPress={submitReschedule}
                disabled={!rComposed || !!actioning}
              >
                {actioning ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>SEND REQUEST</Text>}
              </Pressable>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!cancelFor} transparent animationType="fade" onRequestClose={() => setCancelFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} style={{ alignSelf: "center" }} />
            <Text style={styles.confirmTitle}>Cancel booking?</Text>
            <Text style={styles.confirmBody}>
              Cancel your {cancelFor?.class_name} booking?{"\n\n"}
              Bookings can only be cancelled at least {cancelWindow} hour{cancelWindow === 1 ? "" : "s"} before the start time.
              {cancelFor?.paid_with_pass
                ? " Your class pass will be returned to your account."
                : " If you paid, we'll add it back as account credit."}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.confirmKeep} onPress={() => setCancelFor(null)}>
                <Text style={styles.confirmKeepText}>Keep booking</Text>
              </Pressable>
              <Pressable
                testID="cancel-confirm-btn"
                style={[styles.confirmCancelBtn, actioning === cancelFor?.booking_id && { opacity: 0.6 }]}
                disabled={actioning === cancelFor?.booking_id}
                onPress={() => cancelFor && doCancel(cancelFor)}
              >
                {actioning === cancelFor?.booking_id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmCancelText}>Cancel booking</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  logBtnText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "800" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  countText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  sectionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  sectionBtnText: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontWeight: "800" },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginTop: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
  browseBtn: { backgroundColor: colors.brand, paddingHorizontal: 22, paddingVertical: 12, borderRadius: radius.pill, marginTop: spacing.lg },
  browseBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  swipeHint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.7 },
  bookingRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  bookingCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  cardTopSection: { padding: spacing.md },
  bookingActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border },
  qrInfoBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  qrInfoText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "600" },
  missedBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "rgba(239,68,68,0.10)" },
  missedText: { color: colors.error, fontSize: 12.5, fontWeight: "800", textAlign: "center" },
  attendCard: { borderTopWidth: 1, borderTopColor: colors.border },
  attendHead: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.success, paddingVertical: 9 },
  attendHeadText: { color: "#fff", fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },
  attendBody: { padding: spacing.md, gap: 6 },
  attendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  attendLabel: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "600" },
  attendValue: { color: colors.onSurface, fontSize: 12.5, fontWeight: "800" },
  receiptBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
  receiptBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  checkedInBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#16A34A" },
  checkedInText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  actionBtnGhost: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border },
  actionGhostText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  actionBtnDanger: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  actionDangerText: { color: colors.error, fontWeight: "800", fontSize: 13 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  confirmedBanner: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: spacing.sm, alignSelf: "flex-start", backgroundColor: colors.success + "1F", borderWidth: 1, borderColor: colors.success, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  confirmedBannerText: { color: colors.success, fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  proposeBox: { marginTop: spacing.sm, backgroundColor: "#F59E0B22", borderWidth: 1, borderColor: "#F59E0B", borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  proposeText: { color: colors.onSurface, fontSize: 13.5, lineHeight: 19 },
  pendingBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: spacing.sm, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  pendingText: { flex: 1, color: colors.onSurface, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  proposeConfirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.md },
  proposeConfirmText: { color: colors.onBrand, fontWeight: "900", fontSize: 14, letterSpacing: 0.3 },
  statusText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  notifDelete: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, borderRadius: radius.md, marginLeft: spacing.sm, gap: 2 },
  notifDeleteText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  notifTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  notifBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  walletBar: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  walletCol: { alignItems: "flex-start", minWidth: 78 },
  walletHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  walletLabel: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  walletValue: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginTop: 2 },
  walletDivider: { width: 1, height: 32, backgroundColor: colors.border, marginHorizontal: spacing.md },
  walletCta: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
  walletCtaText: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  timeRowText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  confirmCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  confirmTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "900", textAlign: "center" },
  confirmBody: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 20, textAlign: "center" },
  confirmActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  confirmKeep: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  confirmKeepText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  confirmCancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, backgroundColor: colors.error },
  confirmCancelText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, maxHeight: "85%" },
  modalTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading },
  modalSub: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 2, marginBottom: spacing.md },
  modalLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.sm, marginBottom: 6 },
  modalHint: { color: colors.brand, fontSize: 12, fontWeight: "700", marginTop: 4, marginBottom: 2 },
  pickChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, alignItems: "center" },
  pickChipOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  pickChipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800" },
  pickChipTextOn: { color: colors.brand },
  pickChipTaken: { borderColor: colors.error },
  pickChipTakenText: { color: colors.error, fontSize: 9, fontWeight: "800", textTransform: "uppercase", marginTop: 1 },
  rComposed: { color: colors.onSurface, fontSize: 13.5, fontWeight: "800", marginTop: spacing.sm },
  slotRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: 8 },
  slotRowOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  slotName: { color: colors.onSurface, fontSize: 14.5, fontWeight: "800" },
  slotWhen: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  slotSpots: { fontSize: 11.5, fontWeight: "800", marginTop: 3, letterSpacing: 0.2 },
  modalInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  errBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(239,68,68,0.12)", borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  errBoxText: { color: colors.error, fontSize: 13, fontWeight: "700", flex: 1 },
  modalCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800" },
  modalSubmit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalSubmitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
