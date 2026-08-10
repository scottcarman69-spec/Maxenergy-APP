import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";
import { gymPhotos } from "@/src/gymPhotos";
import FacebookFeed from "@/src/components/FacebookFeed";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  duration_min: number;
  price_cents: number;
  image: string;
  start_at: string;
  category: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "long" });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString([], { month: "short" })}`;
}
function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
}
function catStyle(category: string, name = ""): { color: string; icon: any; set: "ion" | "mci" } {
  const c = (category || "").toLowerCase();
  const nm = (name || "").toLowerCase();
  if (c.includes("kid") || nm.includes("kid")) return { color: "#22C55E", icon: "karate", set: "mci" };
  if (nm.includes("box") || nm.includes("kick")) return { color: "#3B82F6", icon: "boxing-glove", set: "mci" };
  return { color: colors.brand, icon: "barbell", set: "ion" };
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAlerts, setHasAlerts] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([api.classes(), api.unreadNotifications().catch(() => ({ count: 0 }))]);
      setClasses(c.classes || []);
      setHasAlerts((n?.count || 0) > 0);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const upcoming = classes.filter((c) => new Date(c.start_at).getTime() > Date.now()).slice(0, 6);
  const nextClass = upcoming[0];

  const quickActions = [
    { key: "schedule", label: "View Schedule", icon: "calendar", grad: ["#FF7A00", "#FFB259"], onPress: () => router.push("/(tabs)/timetable") },
    { key: "checkin", label: "Class Check-In", icon: "checkmark-done", grad: ["#16A34A", "#4ADE80"], onPress: () => router.push("/check-in") },
    { key: "trial", label: "Free Trial", icon: "gift", grad: ["#9333EA", "#C084FC"], onPress: () => router.push("/free-trial") },
    { key: "membership", label: "Join Membership", icon: "ribbon", grad: ["#2563EB", "#60A5FA"], onPress: () => router.push("/membership") },
    { key: "services", label: "Our Services", icon: "barbell", grad: ["#DC2626", "#F87171"], onPress: () => router.push("/services") },
    { key: "notices", label: "Gym Notices", icon: "megaphone", grad: ["#D97706", "#FBBF24"], onPress: () => router.push("/(tabs)/events") },
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
          <Pressable testID="home-profile-btn" onPress={() => router.push("/(tabs)/profile")} style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
            </View>
            {hasAlerts && <View style={styles.avatarDot} />}
          </Pressable>
        </View>

        <View style={styles.greetBlock}>
          <Text style={styles.greetSmall}>{greetingText()}</Text>
          <Text style={styles.greetName}>{user?.name?.split(" ")[0] || "Champ"} 👋</Text>
          <Text style={styles.greetSub}>Ready for your next session?</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UP NEXT</Text>
              <Pressable testID="home-view-schedule" onPress={() => router.push("/(tabs)/timetable")} style={styles.linkRow}>
                <Text style={styles.linkText}>VIEW SCHEDULE</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>

            {nextClass ? (
              <Pressable
                testID="home-next-class-card"
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: nextClass.class_id } })}
                style={styles.heroCard}
              >
                <Image source={nextClass.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient
                  colors={["rgba(18,18,20,0.35)", "rgba(18,18,20,0.6)", "rgba(18,18,20,0.96)"]}
                  locations={[0, 0.45, 1]}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroContent}>
                  <View style={[styles.badge, { backgroundColor: catStyle(nextClass.category, nextClass.name).color }]}>
                    <Text style={styles.badgeText}>{nextClass.category.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.heroTitle}>{nextClass.name}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={14} color={colors.onSurfaceSecondary} />
                    <Text style={styles.metaText}>{fmtDay(nextClass.start_at)}</Text>
                    <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} style={{ marginLeft: 12 }} />
                    <Text style={styles.metaText}>{fmtTime(nextClass.start_at)}</Text>
                    <Ionicons name="timer-outline" size={14} color={colors.onSurfaceSecondary} style={{ marginLeft: 12 }} />
                    <Text style={styles.metaText}>{nextClass.duration_min} min</Text>
                  </View>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>Book Class</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
                  </View>
                </View>
              </Pressable>
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
              <Pressable testID="home-see-timetable" onPress={() => router.push("/(tabs)/timetable")} style={styles.linkRow}>
                <Text style={styles.linkText}>See all</Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {upcoming.map((c) => {
                const cs = catStyle(c.category, c.name);
                return (
                  <Pressable
                    key={c.class_id}
                    testID={`home-class-${c.class_id}`}
                    style={styles.classRow}
                    onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.class_id } })}
                  >
                    <View style={[styles.leftBar, { backgroundColor: cs.color }]} />
                    <View style={styles.classIcon}>
                      {cs.set === "mci" ? (
                        <MaterialCommunityIcons name={cs.icon} size={24} color={cs.color} />
                      ) : (
                        <Ionicons name={cs.icon} size={22} color={cs.color} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catLabel, { color: cs.color }]}>{c.category.toUpperCase()}</Text>
                      <Text style={styles.className}>{c.name}</Text>
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
    justifyContent: "space-between",
  },
  headerLogo: { width: 150, height: 84, marginLeft: -6 },
  avatarWrap: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
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
  greetSmall: { color: colors.onSurfaceSecondary, fontSize: 16 },
  greetName: { color: colors.onSurface, fontSize: 40, fontFamily: font.display, letterSpacing: -0.5, marginTop: 2 },
  greetSub: { color: colors.onSurfaceSecondary, fontSize: 15, marginTop: 6 },
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
    marginHorizontal: spacing.lg,
    height: 300,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  },
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
