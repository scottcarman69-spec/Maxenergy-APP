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
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/AuthContext";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";

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
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api.classes();
      setClasses(c.classes || []);
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
    { key: "schedule", label: "View Schedule", icon: "calendar", onPress: () => router.push("/(tabs)/timetable") },
    { key: "membership", label: "Join Membership", icon: "card", onPress: () => router.push("/membership") },
    { key: "notices", label: "Gym Notices", icon: "megaphone", onPress: () => router.push("/(tabs)/events") },
    { key: "about", label: "About Us", icon: "people", onPress: () => router.push("/about") },
    { key: "contact", label: "Contact", icon: "call", onPress: () => router.push("/contact") },
  ] as const;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Image
              source={require("../../assets/images/maxenergy-logo.webp")}
              style={styles.headerLogo}
              contentFit="contain"
            />
            <Text style={styles.academy}>MUAY THAI ACADEMY</Text>
            <Text style={styles.hello}>Welcome back, {user?.name?.split(" ")[0] || "champ"}</Text>
          </View>
          <Pressable testID="home-profile-btn" onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>NEXT CLASS</Text>
            {nextClass ? (
              <Pressable
                testID="home-next-class-card"
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: nextClass.class_id } })}
                style={styles.heroCard}
              >
                <Image source={nextClass.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient
                  colors={["transparent", "rgba(18,18,20,0.55)", "rgba(18,18,20,0.95)"]}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.heroContent}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{nextClass.category.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.heroTitle}>{nextClass.name}</Text>
                  <Text style={styles.heroMeta}>
                    {fmtDay(nextClass.start_at)} · {fmtTime(nextClass.start_at)} · {nextClass.duration_min}m
                  </Text>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>Book now</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.emptyHero}>
                <Text style={styles.emptyText}>No upcoming classes right now.</Text>
              </View>
            )}

            <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
            <View style={styles.quickGrid}>
              {quickActions.map((a) => (
                <Pressable key={a.key} testID={`quick-${a.key}`} style={styles.quickCard} onPress={a.onPress}>
                  <View style={styles.quickIcon}>
                    <Ionicons name={a.icon as any} size={20} color={colors.brand} />
                  </View>
                  <Text style={styles.quickLabel}>{a.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UPCOMING CLASSES</Text>
              <Pressable testID="home-see-timetable" onPress={() => router.push("/(tabs)/timetable")}>
                <Text style={styles.linkText}>See all</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {upcoming.slice(0, 4).map((c) => (
                <Pressable
                  key={c.class_id}
                  testID={`home-class-${c.class_id}`}
                  style={styles.classRow}
                  onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.class_id } })}
                >
                  <View style={[styles.catDot, { backgroundColor: c.category === "Kids" ? "#22C55E" : colors.brand }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className}>{c.name}</Text>
                    <Text style={styles.classMeta}>{fmtDate(c.start_at)} · {fmtTime(c.start_at)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerLogo: { width: 150, height: 40, marginLeft: -4 },
  academy: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 3, marginTop: -2 },
  hello: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 6 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onBrand, fontWeight: "900", fontSize: 18 },
  sectionTitle: {
    color: colors.onSurfaceSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  heroCard: {
    marginHorizontal: spacing.lg,
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  heroContent: { padding: spacing.lg },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brand,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  badgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: colors.onSurface, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  heroMeta: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  ctaRow: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ctaText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 0.5 },
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
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  quickCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  linkText: { color: colors.brand, fontSize: 12, fontWeight: "700", paddingRight: spacing.lg, marginTop: spacing.xl },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  className: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  classMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
});
