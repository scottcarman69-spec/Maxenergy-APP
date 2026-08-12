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
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, qldHour, scheduleDay, qldTodayUTC } from "@/src/datetime";
import ScreenBg from "@/src/components/ScreenBg";
import { gymPhotos } from "@/src/gymPhotos";
import { coachSource } from "@/src/coaches";
import FacebookFeed from "@/src/components/FacebookFeed";
import LiveNowBanner from "@/src/components/LiveNowBanner";
import WelcomeTour from "@/src/components/WelcomeTour";
import NoticePopup, { Notice } from "@/src/components/NoticePopup";
import { storage } from "@/src/utils/storage";

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAlerts, setHasAlerts] = useState(false);
  const [attendedMonth, setAttendedMonth] = useState(0);
  const [monthName, setMonthName] = useState("");
  const carouselRef = useRef<ScrollView>(null);
  const [slide, setSlide] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [newNotices, setNewNotices] = useState<Notice[]>([]);

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
    }
    setNewNotices([]);
  }, [newNotices, user?.user_id]);

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
      const [c, n, s] = await Promise.all([
        api.classes(),
        api.unreadNotifications().catch(() => ({ count: 0 })),
        api.meStats().catch(() => ({ attended_this_month: 0, month: "" })),
      ]);
      setClasses(c.classes || []);
      setHasAlerts((n?.count || 0) > 0);
      setAttendedMonth(s?.attended_this_month || 0);
      setMonthName(s?.month || "");
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); checkNewNotices(); }, [load, refresh, checkNewNotices]));

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
  const nextClass = scheduled[0];
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

  const quickActions = [
    { key: "schedule", label: "View Schedule", icon: "calendar", grad: ["#FF7A00", "#FFB259"], onPress: () => router.navigate("/(tabs)/timetable") },
    { key: "checkin", label: "Class Check-In", icon: "checkmark-done", grad: ["#16A34A", "#4ADE80"], onPress: () => router.push("/check-in") },
    { key: "trial", label: "Free Trial", icon: "gift", grad: ["#9333EA", "#C084FC"], onPress: () => router.push("/free-trial") },
    { key: "membership", label: "Join Membership", icon: "ribbon", grad: ["#2563EB", "#60A5FA"], onPress: () => router.push("/vigyr-signon") },
    { key: "services", label: "Our Services", icon: "barbell", grad: ["#DC2626", "#F87171"], onPress: () => router.push("/services") },
    { key: "notices", label: "Gym Notices", icon: "megaphone", grad: ["#D97706", "#FBBF24"], onPress: () => router.navigate("/(tabs)/events") },
    { key: "about", label: "About Us", icon: "people", grad: ["#0891B2", "#22D3EE"], onPress: () => router.push("/about") },
    { key: "contact", label: "Contact Us", icon: "chatbubbles", grad: ["#DB2777", "#F472B6"], onPress: () => router.push("/contact") },
  ] as const;

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
              <Text style={styles.creditChipText}>${((user?.credit_cents || 0) / 100).toFixed(0)}</Text>
            </Pressable>
            <Pressable testID="home-calendar-btn" onPress={() => router.push(user?.is_admin ? "/admin/calendar" : "/calendar")} style={styles.calChip} hitSlop={8}>
              <Text style={styles.calChipMonth}>{qldTodayUTC().toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" }).toUpperCase()}</Text>
              <Text style={styles.calChipDay}>{qldTodayUTC().getUTCDate()}</Text>
            </Pressable>
            <Pressable testID="home-profile-btn" onPress={() => router.navigate("/(tabs)/profile")} style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              {hasAlerts && <View style={styles.avatarDot} />}
            </Pressable>
          </View>
        </View>

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
            onFinish={() => router.navigate("/(tabs)/timetable")}
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

        <LiveNowBanner classes={scheduled} />

        <View style={styles.shortcutRow}>
          <Pressable
            testID="home-book-next"
            style={({ pressed }) => [styles.shortcutBtn, pressed && { opacity: 0.9 }]}
            onPress={() => (nextClass ? router.push({ pathname: "/class/[id]", params: { id: nextClass.class_id } }) : router.navigate("/(tabs)/timetable"))}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name="flash" size={20} color={colors.brand} />
            </View>
            <Text style={styles.shortcutTitle}>Book next class</Text>
            <Text style={styles.shortcutSub} numberOfLines={1}>{nextClass ? nextClass.name : "See timetable"}</Text>
          </Pressable>

          <Pressable
            testID="home-my-bookings"
            style={({ pressed }) => [styles.shortcutBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.push("/bookings")}
          >
            <View style={[styles.shortcutIcon, { backgroundColor: "rgba(34,197,94,0.15)" }]}>
              <Ionicons name="bookmark" size={20} color="#22C55E" />
            </View>
            <Text style={styles.shortcutTitle}>My bookings</Text>
            <Text style={styles.shortcutSub} numberOfLines={1}>View & manage</Text>
          </Pressable>
        </View>

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

            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>QUICK ACTIONS</Text>
            <View style={styles.quickGrid}>
              {quickActions.map((a) => (
                <Pressable
                  key={a.key}
                  testID={`quick-${a.key}`}
                  style={({ pressed }) => [styles.quickCard, pressed && styles.quickCardPressed]}
                  onPress={a.onPress}
                >
                  <View style={styles.quickCardTop}>
                    <LinearGradient
                      colors={a.grad as unknown as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.quickIcon}
                    >
                      <Ionicons name={a.icon as any} size={18} color="#fff" />
                    </LinearGradient>
                    <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceSecondary} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={2}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

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
              {gymPhotos.map((src, i) => (
                <Image key={i} source={src} style={styles.galleryImg} contentFit="cover" />
              ))}
            </ScrollView>

            <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>LATEST FROM FACEBOOK</Text>
            <FacebookFeed />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
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
  calChip: { width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brand, alignItems: "stretch" },
  creditChip: { flexDirection: "row", alignItems: "center", gap: 4, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand },
  creditChipText: { color: colors.brand, fontWeight: "900", fontSize: 14 },
  calChipMonth: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 9, fontWeight: "900", letterSpacing: 1, textAlign: "center", paddingVertical: 2 },
  calChipDay: { flex: 1, color: colors.onSurface, fontSize: 18, fontWeight: "900", textAlign: "center", textAlignVertical: "center", lineHeight: 24 },
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
    height: 300,
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
});
