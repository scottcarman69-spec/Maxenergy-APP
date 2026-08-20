import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  AppState,
  Modal,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { groupLogo } from "@/src/groups";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, qldHour, scheduleDay, qldTodayUTC } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";
import { useGymGallery } from "@/src/useGymGallery";
import { coachSource } from "@/src/coaches";
import LiveNowBanner from "@/src/components/LiveNowBanner";
import WelcomeTour from "@/src/components/WelcomeTour";
import NoticePopup, { Notice } from "@/src/components/NoticePopup";
import AlertPopup, { AlertItem } from "@/src/components/AlertPopup";
import { storage } from "@/src/utils/storage";
import { QUICK_ACTIONS_META, DEFAULT_QUICK_ORDER, HOME_QUICK_COUNT, orderKeys } from "@/src/quickActions";

const CARD_W = Math.min(Dimensions.get("window").width, 480);

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  trainer_photo?: string;
  duration_min: number;
  price_cents: number;
  image: string;
  start_at: string;
  category: string;
  by_appointment?: boolean;
  ended?: boolean;
};

// Class/event times are stored as Queensland (GMT+10) wall-clock, shown as-is.
function fmtTime(iso: string) {
  return classTime(iso);
}
function fmtDay(iso: string) {
  return classDate(iso, { weekday: "long" });
}
function fmtDate(iso: string) {
  return classDate(iso, { weekday: "short", day: "numeric", month: "short" });
}
function greetingText() {
  const h = qldHour();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}
function catStyle(category: string, name = ""): { color: string; icon: any; set: "ion" | "mci" | "img"; img?: any } {
  const c = (category || "").toLowerCase();
  const nm = (name || "").toLowerCase();
  if (c.includes("kid") || nm.includes("kid")) return { color: "#22C55E", icon: "karate", set: "mci" };
  if (nm.includes("box") || nm.includes("kick")) return { color: "#3B82F6", icon: "boxing-glove", set: "mci" };
  if (c.includes("boot") || nm.includes("boot")) return { color: "#F59E0B", icon: "weight-lifter", set: "mci" };
  return { color: colors.brand, icon: "karate", set: "mci" };
}

export default function Home() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const galleryPhotos = useGymGallery();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [passQr, setPassQr] = useState<string | null>(null);
  const [passQrCount, setPassQrCount] = useState(0);
  const [passQrLoading, setPassQrLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAlerts, setHasAlerts] = useState(false);
  const [attendedMonth, setAttendedMonth] = useState(0);
  const [monthName, setMonthName] = useState("");
  const carouselRef = useRef<ScrollView>(null);
  const [slide, setSlide] = useState(0);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [newNotices, setNewNotices] = useState<Notice[]>([]);
  const [newAlerts, setNewAlerts] = useState<AlertItem[]>([]);

  // Muay Thai Academy join popup
  const ACADEMY_ID = "grp_muaythai_academy";
  const [academyOpen, setAcademyOpen] = useState(false);
  const [academy, setAcademy] = useState<{ name: string; members?: number; description?: string; join_status?: string } | null>(null);
  const [academyBusy, setAcademyBusy] = useState(false);
  const [academyMsg, setAcademyMsg] = useState<string | null>(null);
  const [badges, setBadges] = useState<{ bookings: number; notices: number }>({ bookings: 0, notices: 0 });

  const openAcademy = useCallback(async () => {
    setAcademyMsg(null);
    setAcademy(null);
    setAcademyOpen(true);
    try {
      const r = await api.groupsDiscover();
      const g = (r.groups || []).find((x: any) => x.group_id === ACADEMY_ID);
      if (g) setAcademy(g);
      else setAcademy({ name: "Muay Thai Academy" });
    } catch {
      setAcademy({ name: "Muay Thai Academy" });
    }
  }, []);

  const requestAcademyJoin = useCallback(async () => {
    setAcademyBusy(true);
    setAcademyMsg(null);
    try {
      await api.groupJoin(ACADEMY_ID);
      setAcademy((a) => (a ? { ...a, join_status: "pending" } : a));
      setAcademyMsg("🥊 Request sent! The gym will review it and you'll be notified once you're approved.");
    } catch (e: any) {
      setAcademyMsg(e?.message || "Couldn't send your request. Please try again.");
    }
    setAcademyBusy(false);
  }, []);

  // Pop up any gym notices posted since the member last saw them (per user, persisted).
  // On the very first run we set a silent baseline so members aren't spammed with
  // every historical notice — only genuinely NEW notices pop up afterwards.
  const checkNewNotices = useCallback(async () => {
    if (!user?.user_id || user.is_admin) return;
    try {
      const r = await api.announcements();
      const anns: Notice[] = r?.announcements || [];
      if (anns.length === 0) return;
      const newestTs = anns.reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0);
      const key = `last_seen_notice_ts_${user.user_id}`;
      const stored = await storage.getItem<number>(key, 0);
      if (!stored) {
        await storage.setItem(key, newestTs); // silent baseline on first run
        return;
      }
      const unseen = anns
        .filter((a) => new Date(a.created_at).getTime() > stored)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (unseen.length > 0) setNewNotices(unseen);
    } catch {}
  }, [user?.user_id, user?.is_admin]);

  const dismissNotices = useCallback(async () => {
    if (newNotices.length && user?.user_id) {
      const newestTs = newNotices.reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0);
      await storage.setItem(`last_seen_notice_ts_${user.user_id}`, newestTs);
      // Count each notice shown in the popup as a read for per-notice view stats.
      newNotices.forEach((n) => api.trackAnnouncementView(n.announcement_id).catch(() => {}));
    }
    setNewNotices([]);
  }, [newNotices, user?.user_id]);

  // Pop up new personal updates (booking approved/confirmed, new time proposed,
  // gym replies) so members respond faster. Silent baseline on first run.
  const checkNewAlerts = useCallback(async () => {
    if (!user?.user_id || user.is_admin) return;
    try {
      const r = await api.notifications();
      const items: AlertItem[] = (r?.notifications || []).map((n: any) => ({
        notification_id: n.notification_id,
        title: n.title,
        body: n.body,
        created_at: n.created_at,
        nav: n.data?.nav,
        data: n.data,
      }));
      if (items.length === 0) return;
      const newestTs = items.reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0);
      const key = `last_seen_alert_ts_${user.user_id}`;
      const stored = await storage.getItem<number>(key, 0);
      if (!stored) {
        await storage.setItem(key, newestTs); // silent baseline on first run
        return;
      }
      const unseen = items
        .filter((a) => new Date(a.created_at).getTime() > stored)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      if (unseen.length > 0) setNewAlerts(unseen);
    } catch {}
  }, [user?.user_id, user?.is_admin]);

  const dismissAlerts = useCallback(async () => {
    if (newAlerts.length && user?.user_id) {
      const newestTs = newAlerts.reduce((m, a) => Math.max(m, new Date(a.created_at).getTime()), 0);
      await storage.setItem(`last_seen_alert_ts_${user.user_id}`, newestTs);
    }
    setNewAlerts([]);
  }, [newAlerts, user?.user_id]);

  // Tap an update -> jump straight to the relevant screen (booking / message / etc.)
  const openAlert = useCallback(async (item: AlertItem) => {
    await dismissAlerts();
    const nav = item.nav;
    switch (nav) {
      case "member_inbox":
      case "admin_thread":
        router.navigate("/(tabs)/inbox");
        break;
      case "member_bookings":
        router.navigate("/bookings");
        break;
      case "member_membership":
        router.navigate("/vigyr-signon");
        break;
      case "member_store":
        router.navigate("/memberships");
        break;
      case "class_detail":
        if (item.data?.class_id) router.navigate({ pathname: "/class/[id]", params: { id: item.data.class_id } } as any);
        else router.navigate("/(tabs)/alerts");
        break;
      default:
        router.navigate("/(tabs)/alerts");
        break;
    }
  }, [dismissAlerts]);

  // One-time first-run walkthrough for brand-new members (per user, persisted).
  useEffect(() => {
    if (!user?.user_id) return;
    let active = true;
    (async () => {
      const seen = await storage.getItem(`welcome_tour_v2_${user.user_id}`, false);
      if (active && !seen) setShowWelcome(true);
    })();
    return () => { active = false; };
  }, [user?.user_id]);

  const dismissWelcome = useCallback(async () => {
    setShowWelcome(false);
    if (user?.user_id) await storage.setItem(`welcome_tour_v2_${user.user_id}`, true);
  }, [user?.user_id]);

  const load = useCallback(async () => {
    try {
      const [c, n, s, b] = await Promise.all([
        api.classes(),
        api.unreadNotifications().catch(() => ({ count: 0 })),
        api.meStats().catch(() => ({ attended_this_month: 0, month: "" })),
        api.homeBadges().catch(() => ({ bookings: 0, notices: 0 })),
      ]);
      setClasses(c.classes || []);
      setHasAlerts((n?.count || 0) > 0);
      setAttendedMonth(s?.attended_this_month || 0);
      setMonthName(s?.month || "");
      setBadges({ bookings: b?.bookings || 0, notices: b?.notices || 0 });
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); checkNewNotices(); checkNewAlerts(); }, [load, refresh, checkNewNotices, checkNewAlerts]));

  // Auto-refresh when the app is reopened (foregrounded) so content stays current.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        load();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Scheduled (fixed-time) classes only — exclude by-appointment options and ended ones.
  const scheduled = classes.filter((c) => !c.by_appointment && !c.ended);
  const upcoming = scheduled.slice(0, 6);
  const todayKey = qldTodayUTC().toISOString().slice(0, 10);
  const todayCount = scheduled.filter((c) => scheduleDay(c.start_at).toISOString().slice(0, 10) === todayKey).length;

  // Auto-advance the UP NEXT slideshow.
  useEffect(() => {
    if (upcoming.length <= 1) return;
    const id = setInterval(() => {
      setSlide((prev) => {
        const next = (prev + 1) % upcoming.length;
        carouselRef.current?.scrollTo({ x: next * CARD_W, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [upcoming.length]);

  const onSlideScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
    if (i !== slide) setSlide(i);
  };

  // Class Pass button: if the member already holds passes, jump straight to a
  // full-screen entry QR; otherwise send them to the wallet to buy passes.
  const openClassPass = async () => {
    if (passQrLoading) return;
    setPassQrLoading(true);
    try {
      const r = await api.classPassQr();
      if ((r.class_pass_credits || 0) >= 1 && r.code) {
        setPassQrCount(r.class_pass_credits || 0);
        setPassQr(r.code);
      } else {
        router.push("/credits");
      }
    } catch {
      router.push("/credits");
    }
    setPassQrLoading(false);
  };

  const quickActionHandlers: Record<string, () => void> = {
    booknext: () => (scheduled[0] ? router.push({ pathname: "/class/[id]", params: { id: scheduled[0].class_id } }) : router.navigate("/(tabs)/timetable")),
    bookings: () => router.push("/bookings"),
    schedule: () => router.navigate("/(tabs)/timetable"),
    calendar: () => router.push(user?.is_admin ? "/admin/calendar" : "/calendar"),
    checkin: () => router.push("/check-in"),
    membership: () => router.push("/vigyr-signon"),
    classpass: () => router.push("/credits"),
    store: () => router.push("/memberships"),
    giftcards: () => router.push("/gift-cards"),
    academy: () => (user?.is_admin ? router.push("/group/grp_muaythai_academy") : openAcademy()),
    ladder: () => router.navigate("/(tabs)/leaderboard"),
    notices: () => router.navigate("/(tabs)/events"),
    contact: () => router.push("/contact"),
    settings: () => router.push("/inbox-settings"),
    facebook: () => router.push("/social"),
  };

  // Personalised order (drag-to-reorder in Customize). Contextual: hide "Join
  // Membership" once the member is active. First HOME_QUICK_COUNT show up top.
  const availableMeta = QUICK_ACTIONS_META.filter((a) => !(a.key === "membership" && !!user?.membership_active));
  const ordered = orderKeys(availableMeta.map((a) => a.key), user?.quick_actions_order)
    .map((k) => QUICK_ACTIONS_META.find((a) => a.key === k))
    .filter(Boolean)
    .filter((a: any) => !(a.key === "membership" && !!user?.membership_active))
    .map((a: any) => ({ ...a, onPress: quickActionHandlers[a.key] }));
  const primaryActions = ordered.slice(0, HOME_QUICK_COUNT);
  const secondaryActions = ordered.slice(HOME_QUICK_COUNT);
  const visibleActions = showMoreActions ? ordered : primaryActions;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <Image
            source={require("../../assets/images/maxenergy-logo.webp")}
            style={styles.headerLogo}
            contentFit="contain"
          />
          <View style={styles.headerActions}>
            <Pressable testID="home-credit-btn" onPress={() => router.push("/credits")} style={styles.creditChip} hitSlop={8}>
              <Ionicons name="wallet" size={14} color={colors.brand} />
              <Text style={styles.creditChipText}>${(() => { const c = user?.credit_cents || 0; return (c / 100).toFixed(c % 100 === 0 ? 0 : 2); })()}</Text>
              <Text style={styles.creditChipLabel}>credit</Text>
            </Pressable>
            <Pressable testID="home-calendar-btn" onPress={() => router.push(user?.is_admin ? "/admin/calendar" : "/calendar")} style={styles.calChip} hitSlop={8}>
              <Text allowFontScaling={false} style={styles.calChipMonth}>{qldTodayUTC().toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }).toUpperCase()}</Text>
              <View style={styles.calChipDayWrap}>
                <Text allowFontScaling={false} style={styles.calChipDay}>{qldTodayUTC().getUTCDate()}</Text>
              </View>
            </Pressable>
            <Pressable testID="home-profile-btn" onPress={() => router.navigate("/(tabs)/profile")} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              {hasAlerts && <View style={styles.avatarDot} />}
            </Pressable>
          </View>
        </View>

        {user?.is_admin && (
          <Pressable
            testID="home-admin-scan"
            onPress={() => router.push("/admin/scan")}
            style={({ pressed }) => [styles.adminScanBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="qr-code" size={18} color={colors.onBrand} />
            <Text style={styles.adminScanText}>Scan Check-In QR</Text>
          </Pressable>
        )}

        {user && !user.is_admin && (
          <View style={styles.memberQrCol}>
            <Pressable
              testID="home-member-qr"
              onPress={() => router.push("/check-in")}
              style={({ pressed }) => [styles.adminScanBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="qr-code" size={18} color={colors.onBrand} />
              <Text style={styles.adminScanText}>My Check-In QR</Text>
            </Pressable>
            <Pressable
              testID="home-member-classpass"
              onPress={openClassPass}
              style={({ pressed }) => [pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={["#22C55E", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.classPassBtn}
              >
                {passQrLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="ticket" size={18} color="#fff" />
                )}
                <Text style={styles.classPassText}>Class Pass</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}

        <View style={styles.greetBlock}>
          <Text style={styles.greetSmall}>{greetingText()}</Text>
          <Text style={styles.greetName}>{user?.name?.split(" ")[0] || "Champ"} 👋</Text>
          <Text style={styles.greetSub}>Ready for your next session?</Text>
          <View style={styles.pillRow}>
            <View style={styles.todayPill}>
              <Ionicons name="calendar" size={13} color={colors.brand} />
              <Text style={styles.todayPillText}>
                {todayCount > 0 ? `${todayCount} ${todayCount === 1 ? "class" : "classes"} today` : "No classes today"}
              </Text>
            </View>
            <View style={styles.streakPill}>
              <Ionicons name="flame" size={13} color="#FB923C" />
              <Text style={styles.streakPillText}>
                {attendedMonth} attended{monthName ? ` in ${monthName}` : " this month"}
              </Text>
            </View>
          </View>
        </View>

        {showWelcome && (
          <WelcomeTour
            visible={showWelcome}
            onDone={dismissWelcome}
            onFinish={() => router.navigate("/(tabs)/home")}
          />
        )}

        {!showWelcome && (
          <NoticePopup
            visible={newNotices.length > 0}
            notices={newNotices}
            onClose={dismissNotices}
            onViewAll={async () => { await dismissNotices(); router.navigate("/(tabs)/events"); }}
          />
        )}

        {!showWelcome && newNotices.length === 0 && (
          <AlertPopup
            visible={newAlerts.length > 0}
            items={newAlerts}
            onClose={dismissAlerts}
            onOpen={openAlert}
            onViewAll={async () => { await dismissAlerts(); router.navigate("/(tabs)/alerts"); }}
          />
        )}

        <LiveNowBanner classes={scheduled} />

        {user && !user.is_admin && !user.membership_form_completed && !user.vigyr_signup_reported && !user.membership_active && (
          <Pressable testID="home-store-btn" onPress={() => router.push("/vigyr-signon")} style={[styles.verifyBanner, { marginTop: spacing.lg }]}>
            <Ionicons name="document-text-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyTitle}>Complete New Membership Form</Text>
              <Text style={styles.verifySub}>New members — sign up and join Maxenergy Fitness</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        )}

        {user && user.verified === false && (
          <Pressable
            testID="home-verify-banner"
            onPress={() => router.push({ pathname: "/(auth)/verify", params: { email: user.email } })}
            style={styles.verifyBanner}
          >
            <Ionicons name="mail-unread-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyTitle}>Verify your email</Text>
              <Text style={styles.verifySub}>Confirm {user.email} to secure your account</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>
        )}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UP NEXT</Text>
              <Pressable testID="home-view-schedule" onPress={() => router.navigate("/(tabs)/timetable")} style={styles.linkRow}>
                <Text style={styles.linkText}>VIEW SCHEDULE</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>

            {upcoming.length > 0 ? (
              <>
                <ScrollView
                  ref={carouselRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onSlideScroll}
                  scrollEventThrottle={16}
                  decelerationRate="fast"
                >
                  {upcoming.map((cls, idx) => (
                    <View key={cls.class_id} style={styles.slide}>
                      <Pressable
                        testID={idx === 0 ? "home-next-class-card" : `home-upcoming-${cls.class_id}`}
                        onPress={() => router.push({ pathname: "/class/[id]", params: { id: cls.class_id } })}
                        style={styles.heroCard}
                      >
                        <Image source={cls.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                        <LinearGradient
                          colors={["rgba(18,18,20,0.35)", "rgba(18,18,20,0.6)", "rgba(18,18,20,0.96)"]}
                          locations={[0, 0.45, 1]}
                          start={{ x: 1, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.heroContent}>
                          <View style={[styles.badge, { backgroundColor: catStyle(cls.category, cls.name).color }]}>
                            <Text style={styles.badgeText}>{cls.category.toUpperCase()}</Text>
                          </View>
                          <Text style={styles.heroTitle}>{cls.name}</Text>
                          <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={14} color={colors.onSurfaceSecondary} />
                            <Text style={styles.metaText}>{fmtDay(cls.start_at)}</Text>
                            <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} style={{ marginLeft: 12 }} />
                            <Text style={styles.metaText}>{fmtTime(cls.start_at)}</Text>
                            <Ionicons name="timer-outline" size={14} color={colors.onSurfaceSecondary} style={{ marginLeft: 12 }} />
                            <Text style={styles.metaText}>{cls.duration_min} min</Text>
                          </View>
                          <View style={styles.ctaRow}>
                            <Text style={styles.ctaText}>Book Class</Text>
                            <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>

                {upcoming.length > 1 && (
                  <View style={styles.dots}>
                    {upcoming.map((_, i) => (
                      <View key={i} style={[styles.dot, i === slide && styles.dotOn]} />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyHero}>
                <Text style={styles.emptyText}>No upcoming classes right now.</Text>
              </View>
            )}

            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
              <Pressable testID="quick-customize" onPress={() => router.push("/customize-actions")} style={styles.linkRow}>
                <Ionicons name="options-outline" size={13} color={colors.brand} />
                <Text style={styles.linkText}>CUSTOMISE</Text>
              </Pressable>
            </View>
            <View style={styles.quickGrid}>
              {visibleActions.map((a) => (
                <Pressable
                  key={a.key}
                  testID={`quick-${a.key}`}
                  style={({ pressed }) => [styles.quickCard, pressed && styles.quickCardPressed]}
                  onPress={a.onPress}
                >
                  {(badges as any)[a.key] > 0 && (
                    <View style={styles.quickBadge} testID={`quick-badge-${a.key}`}>
                      <Text style={styles.quickBadgeText}>{(badges as any)[a.key] > 9 ? "9+" : (badges as any)[a.key]}</Text>
                    </View>
                  )}
                  <View style={styles.quickCardTop}>
                    <LinearGradient
                      colors={a.grad as unknown as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.quickIcon}
                    >
                      {a.key === "academy" ? (
                        <Image source={groupLogo("muay-thai-academy") as any} style={styles.quickLogo} contentFit="contain" />
                      ) : (
                        <Ionicons name={a.icon as any} size={18} color="#fff" />
                      )}
                    </LinearGradient>
                    <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceSecondary} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={2}>{a.label}</Text>
                </Pressable>
              ))}
              {Array.from({ length: (4 - (visibleActions.length % 4)) % 4 }).map((_, i) => (
                <View key={`spacer-${i}`} style={styles.quickSpacer} />
              ))}
            </View>
            {secondaryActions.length > 0 && (
              <Pressable
                testID="quick-toggle-more"
                style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowMoreActions((v) => !v)}
              >
                <Ionicons name={showMoreActions ? "chevron-up" : "chevron-down"} size={16} color={colors.brand} />
                <Text style={styles.moreBtnText}>
                  {showMoreActions ? "Show less" : `More actions (${secondaryActions.length})`}
                </Text>
              </Pressable>
            )}

            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>UPCOMING CLASSES</Text>
              <Pressable testID="home-see-timetable" onPress={() => router.navigate("/(tabs)/timetable")} style={styles.linkRow}>
                <Text style={styles.linkText}>See all</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {upcoming.slice(0, 4).map((c) => {
                const cs = catStyle(c.category, c.name);
                return (
                  <Pressable
                    key={c.class_id}
                    testID={`home-class-${c.class_id}`}
                    style={styles.classRow}
                    onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.class_id } })}
                  >
                    <View style={[styles.leftBar, { backgroundColor: cs.color }]} />
                    {coachSource(c.trainer, c.trainer_photo) ? (
                      <Pressable
                        testID={`home-coach-${c.class_id}`}
                        style={styles.classIcon}
                        onPress={() => router.push({ pathname: "/coach", params: { name: c.trainer } })}
                      >
                        <Image source={coachSource(c.trainer, c.trainer_photo)} style={styles.classIconImg} contentFit="cover" />
                        <View style={[styles.classCatChip, { backgroundColor: cs.color }]}>
                          <MaterialCommunityIcons name={cs.set === "mci" ? cs.icon : "karate"} size={10} color="#fff" />
                        </View>
                      </Pressable>
                    ) : (
                      <View style={styles.classIcon}>
                        {cs.set === "img" ? (
                          <Image source={cs.img} style={styles.classIconImg} contentFit="cover" />
                        ) : cs.set === "mci" ? (
                          <MaterialCommunityIcons name={cs.icon} size={24} color={cs.color} />
                        ) : (
                          <Ionicons name={cs.icon} size={22} color={cs.color} />
                        )}
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catLabel, { color: cs.color }]}>{c.category.toUpperCase()}</Text>
                      <Text style={styles.className}>{c.name}</Text>
                      <View style={styles.metaRow}>
                        <Ionicons name="person-outline" size={13} color={colors.onSurfaceSecondary} />
                        <Text style={styles.classMeta}>{c.trainer}</Text>
                      </View>
                      <View style={styles.metaRow}>
                        <Ionicons name="calendar-outline" size={13} color={colors.onSurfaceSecondary} />
                        <Text style={styles.classMeta}>{fmtDate(c.start_at)}</Text>
                        <Ionicons name="time-outline" size={13} color={colors.onSurfaceSecondary} style={{ marginLeft: 10 }} />
                        <Text style={styles.classMeta}>{fmtTime(c.start_at)}</Text>
                      </View>
                    </View>
                    <Pressable
                      testID={`home-book-${c.class_id}`}
                      style={styles.bookBtn}
                      onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.class_id } })}
                    >
                      <Text style={styles.bookText}>Book</Text>
                    </Pressable>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>OUR GYM</Text>
              <Pressable testID="home-see-about" onPress={() => router.push("/about")} style={styles.linkRow}>
                <Text style={styles.linkText}>About us</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            >
              {galleryPhotos.map((src, i) => (
                <Pressable key={i} testID={`home-gym-photo-${i}`} onPress={() => setLightbox(i)} accessibilityRole="imagebutton">
                  <Image source={src} style={styles.galleryImg} contentFit="cover" />
                  <View style={styles.galleryExpand}>
                    <Ionicons name="expand" size={15} color="#fff" />
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={styles.sectionTitle}>LATEST FROM FACEBOOK</Text>
              <Pressable testID="home-see-facebook" onPress={() => router.push("/social")} style={styles.linkRow}>
                <Text style={styles.linkText}>Open</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Pressable testID="home-facebook-card" style={styles.fbCard} onPress={() => router.push("/social")}>
                <View style={styles.fbIcon}>
                  <Ionicons name="logo-facebook" size={26} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fbTitle}>See our latest posts</Text>
                  <Text style={styles.fbSub} numberOfLines={2}>News, events & photos from Max Energy Fitness and Combat Club</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.brand} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={academyOpen} transparent animationType="fade" onRequestClose={() => setAcademyOpen(false)}>
        <Pressable style={styles.acadOverlay} onPress={() => setAcademyOpen(false)}>
          <Pressable style={styles.acadCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.acadIcon}>
              <MaterialCommunityIcons name="shield-half-full" size={30} color="#F59E0B" />
            </View>
            <Text style={styles.acadTitle}>Muay Thai Academy</Text>
            <Text style={styles.acadBody}>
              {academy?.description ||
                "Join our exclusive Muay Thai Academy group — training tips, event updates and a direct line to the coaches and the crew."}
            </Text>
            {typeof academy?.members === "number" && (
              <Text style={styles.acadMembers}>👥 {academy.members} member{academy.members === 1 ? "" : "s"}</Text>
            )}

            {academyMsg ? (
              <Text style={styles.acadMsg}>{academyMsg}</Text>
            ) : academy?.join_status === "member" ? (
              <Pressable
                testID="academy-open-chat"
                style={styles.acadPrimary}
                onPress={() => { setAcademyOpen(false); router.push("/group/grp_muaythai_academy"); }}
              >
                <Ionicons name="chatbubbles" size={17} color={colors.onBrand} />
                <Text style={styles.acadPrimaryText}>OPEN GROUP CHAT</Text>
              </Pressable>
            ) : academy?.join_status === "pending" ? (
              <View style={styles.acadPending}>
                <Ionicons name="hourglass-outline" size={16} color="#F59E0B" />
                <Text style={styles.acadPendingText}>Your request is pending the gym's approval.</Text>
              </View>
            ) : (
              <Pressable
                testID="academy-join-btn"
                style={[styles.acadPrimary, academyBusy && { opacity: 0.6 }]}
                onPress={requestAcademyJoin}
                disabled={academyBusy || !academy}
              >
                {academyBusy ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color={colors.onBrand} />
                    <Text style={styles.acadPrimaryText}>REQUEST TO JOIN</Text>
                  </>
                )}
              </Pressable>
            )}

            <Pressable testID="academy-close" style={styles.acadClose} onPress={() => setAcademyOpen(false)}>
              <Text style={styles.acadCloseText}>{academyMsg ? "Done" : "Maybe later"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* OUR GYM photo lightbox */}
      <Modal visible={lightbox !== null} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lbBackdrop} onPress={() => setLightbox(null)}>
          <Pressable testID="home-gym-lightbox-close" style={styles.lbClose} onPress={() => setLightbox(null)} hitSlop={12}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          {lightbox !== null && (
            <Image source={galleryPhotos[lightbox]} style={styles.lbImage} contentFit="contain" />
          )}
          {lightbox !== null && galleryPhotos.length > 1 && (
            <View style={styles.lbNav}>
              <Pressable testID="home-gym-prev" style={styles.lbNavBtn} onPress={() => setLightbox((i) => (i === null ? 0 : (i - 1 + galleryPhotos.length) % galleryPhotos.length))} hitSlop={10}>
                <Ionicons name="chevron-back" size={26} color="#fff" />
              </Pressable>
              <Text style={styles.lbCount}>{lightbox + 1} / {galleryPhotos.length}</Text>
              <Pressable testID="home-gym-next" style={styles.lbNavBtn} onPress={() => setLightbox((i) => (i === null ? 0 : (i + 1) % galleryPhotos.length))} hitSlop={10}>
                <Ionicons name="chevron-forward" size={26} color="#fff" />
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      {/* Class Pass entry QR — full screen */}
      <Modal visible={!!passQr} transparent animationType="fade" onRequestClose={() => setPassQr(null)}>
        <Pressable style={styles.cpBackdrop} onPress={() => setPassQr(null)}>
          <Pressable style={styles.cpCard} onPress={() => {}}>
            <View style={styles.cpIcon}>
              <Ionicons name="ticket" size={22} color={colors.brand} />
            </View>
            <Text style={styles.cpTitle}>Class Pass Entry</Text>
            <Text style={styles.cpSub}>Show this to gym staff to check in</Text>
            <View style={styles.cpCountPill}>
              <Ionicons name="ticket" size={14} color={colors.brand} />
              <Text style={styles.cpCountText}>{passQrCount} pass{passQrCount === 1 ? "" : "es"} left</Text>
            </View>
            <View style={styles.cpQrBox}>
              {passQr ? <QRCode value={passQr} size={240} backgroundColor="#fff" color="#000" /> : null}
            </View>
            <View style={styles.cpHintRow}>
              <Ionicons name="information-circle-outline" size={15} color={colors.onSurfaceSecondary} />
              <Text style={styles.cpHint}>Keep your screen bright. One pass is used per check-in.</Text>
            </View>
            <Pressable testID="home-classpass-close" style={styles.cpClose} onPress={() => setPassQr(null)}>
              <Text style={styles.cpCloseText}>DONE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  acadOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  acadCard: { width: "100%", maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, alignItems: "center" },
  acadIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(245,158,11,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  acadTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading, textAlign: "center" },
  acadBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8 },
  acadMembers: { color: colors.onSurfaceSecondary, fontSize: 12.5, fontWeight: "700", marginTop: 10 },
  acadMsg: { color: colors.success, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 16, fontWeight: "600" },
  acadPrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, alignSelf: "stretch", marginTop: 18 },
  acadPrimaryText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5 },
  acadPending: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "#F59E0B", paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, alignSelf: "stretch", marginTop: 18 },
  acadPendingText: { color: "#F59E0B", fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "center" },
  acadClose: { marginTop: 12, paddingVertical: 8 },
  acadCloseText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600" },  root: { flex: 1, backgroundColor: "transparent" },
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  headerLogo: { width: 150, height: 84 },
  headerActions: { position: "absolute", right: spacing.lg, top: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  creditChip: { flexDirection: "row", alignItems: "center", gap: 3, height: 44, paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  creditChipText: { color: colors.brand, fontWeight: "900", fontSize: 14 },
  creditChipLabel: { color: colors.brand, fontWeight: "700", fontSize: 9.5, opacity: 0.85, marginLeft: 1 },
  calChip: { width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand, alignItems: "stretch" },
  calChipMonth: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 9, fontWeight: "900", letterSpacing: 1, textAlign: "center", height: 15, lineHeight: 15 },
  calChipDayWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  calChipDay: { color: colors.onSurface, fontSize: 17, fontWeight: "900", textAlign: "center", includeFontPadding: false },
  avatarWrap: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onSurface, fontFamily: font.display, fontSize: 18 },
  avatarDot: { position: "absolute", top: 2, right: 2, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.surface },
  greetBlock: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  adminScanBtn: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-end", marginRight: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.brand, paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill },
  memberQrCol: { alignItems: "flex-end", gap: spacing.sm },
  classPassBtn: { flexDirection: "row", alignItems: "center", gap: 7, marginRight: spacing.lg, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, shadowColor: "#059669", shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  classPassText: { color: "#fff", fontFamily: font.heading, fontSize: 13, letterSpacing: 0.3 },
  adminScanText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.3 },
  shortcutRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  shortcutBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  shortcutIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  shortcutTitle: { color: colors.onSurface, fontSize: 15, fontFamily: font.heading },
  shortcutSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  welcomeCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand, gap: 6 },
  welcomeClose: { position: "absolute", top: 10, right: 10, width: 30, height: 30, alignItems: "center", justifyContent: "center", zIndex: 2 },
  welcomeIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  welcomeTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  welcomeText: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 20 },
  welcomeBtns: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  welcomePrimary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 11, borderRadius: radius.pill },
  welcomePrimaryText: { color: colors.onBrand, fontSize: 14, fontFamily: font.heading },
  welcomeGhost: { paddingHorizontal: spacing.md, paddingVertical: 11 },
  welcomeGhostText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "700" },
  greetSmall: { color: colors.onSurfaceSecondary, fontSize: 16 },
  greetName: { color: colors.onSurface, fontSize: 40, fontFamily: font.display, letterSpacing: -0.5, marginTop: 2 },
  greetSub: { color: colors.onSurfaceSecondary, fontSize: 15, marginTop: 6 },
  verifyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  verifyTitle: { color: colors.onSurface, fontFamily: font.heading, fontSize: 14.5 },
  verifySub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  storeCta: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brand },
  storeIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  storeTitle: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15 },
  storeSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12 },
  todayPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  todayPillText: { color: colors.brand, fontWeight: "800", fontSize: 12.5 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(251,146,60,0.12)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: "#FB923C" },
  streakPillText: { color: "#FB923C", fontWeight: "800", fontSize: 12.5 },
  sectionTitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 12,
    fontFamily: font.heading,
    letterSpacing: 1.5,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.xl,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 5, paddingRight: spacing.lg, marginBottom: spacing.md },
  linkText: { color: colors.brand, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  heroCard: {
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: colors.border,
  },
  slide: { width: CARD_W, paddingHorizontal: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotOn: { backgroundColor: colors.brand, width: 20 },
  heroContent: { padding: spacing.lg },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: colors.onSurface, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5, flexWrap: "wrap" },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  ctaRow: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    alignSelf: "flex-start",
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ctaText: { color: colors.onBrand, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 },
  emptyHero: {
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  emptyText: { color: colors.onSurfaceSecondary },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    rowGap: spacing.md,
  },
  quickSpacer: { width: "23.5%" },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  moreBtnText: { color: colors.brand, fontSize: 13, fontWeight: "800", letterSpacing: 0.3 },
  quickCard: {
    width: "23.5%",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 8,
    minHeight: 96,
  },
  quickCardPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  quickBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surface,
    zIndex: 5,
  },
  quickBadgeText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  quickCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  quickLabel: { color: colors.onSurface, fontFamily: font.heading, fontSize: 12, marginTop: 9, lineHeight: 15 },
  quickLogo: { width: 38, height: 38 },
  fbCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  fbIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center" },
  fbTitle: { color: colors.onSurface, fontSize: 15.5, fontWeight: "900" },
  fbSub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  leftBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  classIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  classIconImg: { width: 46, height: 46 },
  classCatChip: { position: "absolute", right: 0, bottom: 0, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: colors.surfaceSecondary },
  catLabel: { fontSize: 11, fontWeight: "900", letterSpacing: 0.8, marginBottom: 2 },
  className: { color: colors.onSurface, fontWeight: "800", fontSize: 16 },
  classMeta: { color: colors.onSurfaceSecondary, fontSize: 12 },
  bookBtn: {
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bookText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  galleryImg: { width: 240, height: 160, borderRadius: radius.lg },
  galleryExpand: { position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  lbBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  lbClose: { position: "absolute", top: 48, right: 20, zIndex: 2, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  lbImage: { width: "92%", height: "70%" },
  cpBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.82)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  cpCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", width: "100%", maxWidth: 360, borderWidth: 1, borderColor: colors.border },
  cpIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  cpTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  cpSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  cpCountPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, marginBottom: spacing.lg },
  cpCountText: { color: colors.brand, fontSize: 14, fontWeight: "900" },
  cpQrBox: { backgroundColor: "#fff", padding: 18, borderRadius: radius.md },
  cpHintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  cpHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", flexShrink: 1 },
  cpClose: { backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, alignItems: "center", alignSelf: "stretch", marginTop: spacing.lg },
  cpCloseText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  lbNav: { position: "absolute", bottom: 44, flexDirection: "row", alignItems: "center", gap: spacing.xl },
  lbNavBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  lbCount: { color: "#fff", fontSize: 14, fontWeight: "800", minWidth: 54, textAlign: "center" },
});
