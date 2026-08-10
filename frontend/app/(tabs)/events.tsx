import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";

type Ann = { announcement_id: string; title: string; body: string; pinned: boolean; author: string; created_at: string };
type Evt = { event_id: string; title: string; start_at: string; image: string; location: string };

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}
function fmtEvt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })} · ${d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`;
}

export default function Notices() {
  const router = useRouter();
  const [anns, setAnns] = useState<Ann[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([api.announcements(), api.events()]);
      setAnns(a.announcements || []);
      setEvents(e.events || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isEmpty = !loading && anns.length === 0 && events.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>STAY IN THE LOOP</Text>
        <Text style={styles.title}>Gym Notices</Text>
        <Text style={styles.subtitle}>Announcements & upcoming events</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {isEmpty && (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="megaphone-outline" size={30} color={colors.brand} />
              </View>
              <Text style={styles.emptyTitle}>All quiet for now</Text>
              <Text style={styles.emptyText}>New announcements and events will show up here.</Text>
            </View>
          )}

          {anns.length > 0 && (
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>ANNOUNCEMENTS</Text>
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{anns.length}</Text>
              </View>
            </View>
          )}

          {anns.map((a) => {
            const grad: [string, string] = a.pinned ? ["#FF9A3D", "#FF7A00"] : ["#3B82F6", "#2563EB"];
            const accent = a.pinned ? colors.brand : "#3B82F6";
            return (
              <View key={a.announcement_id} testID={`ann-${a.announcement_id}`} style={styles.annCard}>
                <View style={[styles.leftBar, { backgroundColor: accent }]} />
                <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.annIcon}>
                  <Ionicons name={a.pinned ? "pin" : "megaphone"} size={20} color="#fff" />
                </LinearGradient>
                <View style={styles.annContent}>
                  <View style={styles.annTop}>
                    {a.pinned ? (
                      <Text style={[styles.tag, { color: colors.brand }]}>PINNED</Text>
                    ) : (
                      <Text style={[styles.tag, { color: accent }]}>NOTICE</Text>
                    )}
                    <Text style={styles.annTime}>{timeAgo(a.created_at)}</Text>
                  </View>
                  <Text style={styles.annTitle}>{a.title}</Text>
                  <Text style={styles.annBody}>{a.body}</Text>
                  <Text style={styles.annAuthor}>— {a.author}</Text>
                </View>
              </View>
            );
          })}

          {events.length > 0 && (
            <>
              <View style={[styles.sectionHead, { marginTop: spacing.lg }]}>
                <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{events.length}</Text>
                </View>
              </View>
              {events.map((e) => (
                <Pressable
                  key={e.event_id}
                  testID={`event-card-${e.event_id}`}
                  onPress={() => router.push({ pathname: "/event/[id]", params: { id: e.event_id } })}
                  style={({ pressed }) => [styles.evtCard, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
                >
                  <Image source={e.image} style={styles.evtImage} contentFit="cover" />
                  <LinearGradient
                    colors={["transparent", "rgba(18,18,20,0.4)", "rgba(18,18,20,0.96)"]}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.evtBadge}>
                    <Ionicons name="calendar" size={12} color={colors.onBrand} />
                    <Text style={styles.evtBadgeText}>{fmtEvt(e.start_at)}</Text>
                  </View>
                  <View style={styles.evtContent}>
                    <Text style={styles.evtTitle}>{e.title}</Text>
                    {!!e.location && (
                      <View style={styles.evtMeta}>
                        <Ionicons name="location-outline" size={13} color={colors.onSurfaceSecondary} />
                        <Text style={styles.evtMetaText} numberOfLines={1}>{e.location}</Text>
                      </View>
                    )}
                    <View style={styles.evtCta}>
                      <Text style={styles.evtCtaText}>View & RSVP</Text>
                      <Ionicons name="arrow-forward" size={13} color={colors.brand} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  eyebrow: { color: colors.brand, fontSize: 11, fontFamily: font.heading, letterSpacing: 2 },
  title: { ...type.h1, marginTop: 2 },
  subtitle: { ...type.small, marginTop: 2 },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md, marginTop: spacing.xs },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5 },
  countPill: { minWidth: 22, height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  countPillText: { color: colors.brand, fontSize: 11, fontFamily: font.heading },

  annCard: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    paddingLeft: spacing.lg + 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  leftBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  annIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  annContent: { flex: 1, gap: 4 },
  annTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tag: { fontSize: 10, fontFamily: font.heading, letterSpacing: 1.5 },
  annTime: { color: colors.onSurfaceSecondary, fontSize: 11 },
  annTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  annBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  annAuthor: { color: colors.brand, fontSize: 12, fontFamily: font.semibold, marginTop: 2 },

  evtCard: { height: 190, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end", borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  evtImage: { ...StyleSheet.absoluteFillObject },
  evtBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  evtBadgeText: { color: colors.onBrand, fontSize: 11, fontFamily: font.heading },
  evtContent: { padding: spacing.lg, gap: 6 },
  evtTitle: { color: colors.onSurface, fontSize: 22, fontFamily: font.display, letterSpacing: -0.3 },
  evtMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  evtMetaText: { color: colors.onSurfaceSecondary, fontSize: 13, flexShrink: 1 },
  evtCta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  evtCtaText: { color: colors.brand, fontSize: 13, fontFamily: font.heading, letterSpacing: 0.3 },

  emptyCard: {
    marginTop: spacing.xl,
    padding: spacing.xxl,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 13.5, textAlign: "center" },
});
