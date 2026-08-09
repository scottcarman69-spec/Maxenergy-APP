import React, { useCallback, useEffect, useState } from "react";
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
import { colors, spacing, radius, type } from "@/src/theme";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  duration_min: number;
  price_cents: number;
  image: string;
  start_at: string;
  color: string;
};
type Evt = {
  event_id: string;
  title: string;
  start_at: string;
  image: string;
  description: string;
  location: string;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([api.classes(), api.events()]);
      setClasses(c.classes || []);
      setEvents(e.events || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const upcoming = classes.filter((c) => new Date(c.start_at).getTime() > Date.now()).slice(0, 5);
  const nextClass = upcoming[0];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>MAXENERGY FITNESS</Text>
            <Text style={styles.hello}>Hey {user?.name?.split(" ")[0] || "there"} 👊</Text>
          </View>
          <Pressable
            testID="home-profile-btn"
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.avatar}
          >
            <Ionicons name="person" size={20} color={colors.onSurface} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <>
            {nextClass && (
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
                    <Ionicons name="flash" size={12} color={colors.onBrand} />
                    <Text style={styles.badgeText}>NEXT UP</Text>
                  </View>
                  <Text style={styles.heroTitle}>{nextClass.name}</Text>
                  <View style={styles.heroMetaRow}>
                    <Ionicons name="time-outline" size={14} color={colors.onSurfaceSecondary} />
                    <Text style={styles.heroMeta}>
                      {fmtDate(nextClass.start_at)} · {fmtTime(nextClass.start_at)} · {nextClass.duration_min}m
                    </Text>
                  </View>
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>Book now</Text>
                    <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
                  </View>
                </View>
              </Pressable>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UPCOMING CLASSES</Text>
              <Pressable testID="home-see-timetable" onPress={() => router.push("/(tabs)/timetable")}>
                <Text style={styles.linkText}>See all</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
            >
              {upcoming.slice(1).map((c) => (
                <Pressable
                  key={c.class_id}
                  testID={`home-class-${c.class_id}`}
                  style={styles.smallCard}
                  onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.class_id } })}
                >
                  <Image source={c.image} style={styles.smallImage} contentFit="cover" />
                  <LinearGradient
                    colors={["transparent", "rgba(18,18,20,0.9)"]}
                    style={styles.smallOverlay}
                  />
                  <View style={styles.smallContent}>
                    <Text style={styles.smallTitle}>{c.name}</Text>
                    <Text style={styles.smallMeta}>
                      {fmtDate(c.start_at)} · {fmtTime(c.start_at)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
              <Pressable testID="home-see-events" onPress={() => router.push("/(tabs)/events")}>
                <Text style={styles.linkText}>See all</Text>
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
              {events.slice(0, 3).map((e) => (
                <Pressable
                  key={e.event_id}
                  testID={`home-event-${e.event_id}`}
                  style={styles.eventCard}
                  onPress={() => router.push({ pathname: "/event/[id]", params: { id: e.event_id } })}
                >
                  <Image source={e.image} style={styles.eventThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>{e.title}</Text>
                    <Text style={styles.eventMeta}>
                      {fmtDate(e.start_at)} · {fmtTime(e.start_at)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  hello: { color: colors.onSurface, fontSize: 26, fontWeight: "800", marginTop: 4 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    marginHorizontal: spacing.lg,
    height: 240,
    borderRadius: radius.lg,
    overflow: "hidden",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
  },
  heroContent: { padding: spacing.lg },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
  },
  badgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  heroTitle: { color: colors.onSurface, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  heroMeta: { color: colors.onSurfaceSecondary, fontSize: 13 },
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  linkText: { color: colors.brand, fontSize: 12, fontWeight: "700" },
  smallCard: { width: 180, height: 140, borderRadius: radius.md, overflow: "hidden" },
  smallImage: { ...StyleSheet.absoluteFillObject },
  smallOverlay: { ...StyleSheet.absoluteFillObject },
  smallContent: { position: "absolute", left: 12, right: 12, bottom: 12 },
  smallTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  smallMeta: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventThumb: { width: 56, height: 56, borderRadius: radius.sm },
  eventTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  eventMeta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
});
