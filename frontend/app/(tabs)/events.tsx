import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

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
  return `${d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
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

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Gym Notices</Text>
        <Text style={styles.subtitle}>Announcements & events</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {anns.map((a) => (
            <View key={a.announcement_id} testID={`ann-${a.announcement_id}`} style={styles.annCard}>
              <View style={styles.annTop}>
                {a.pinned && (
                  <View style={styles.pinBadge}>
                    <Ionicons name="pin" size={11} color={colors.onBrand} />
                    <Text style={styles.pinText}>PINNED</Text>
                  </View>
                )}
                <Text style={styles.annTime}>{timeAgo(a.created_at)}</Text>
              </View>
              <Text style={styles.annTitle}>{a.title}</Text>
              <Text style={styles.annBody}>{a.body}</Text>
              <Text style={styles.annAuthor}>— {a.author}</Text>
            </View>
          ))}

          {events.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
              {events.map((e) => (
                <Pressable
                  key={e.event_id}
                  testID={`event-card-${e.event_id}`}
                  onPress={() => router.push({ pathname: "/event/[id]", params: { id: e.event_id } })}
                  style={styles.evtCard}
                >
                  <Image source={e.image} style={styles.evtImage} contentFit="cover" />
                  <LinearGradient
                    colors={["transparent", "rgba(18,18,20,0.4)", "rgba(18,18,20,0.95)"]}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.evtBadge}>
                    <Text style={styles.evtBadgeText}>{fmtEvt(e.start_at)}</Text>
                  </View>
                  <View style={styles.evtContent}>
                    <Text style={styles.evtTitle}>{e.title}</Text>
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
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { ...type.h1 },
  subtitle: { ...type.small, marginTop: 2 },
  annCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  annTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pinBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brand,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pinText: { color: colors.onBrand, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  annTime: { color: colors.onSurfaceSecondary, fontSize: 11, marginLeft: "auto" },
  annTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  annBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  annAuthor: { color: colors.brand, fontSize: 12, fontWeight: "700", marginTop: 2 },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: spacing.md },
  evtCard: { height: 170, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end" },
  evtImage: { ...StyleSheet.absoluteFillObject },
  evtBadge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  evtBadgeText: { color: colors.onBrand, fontSize: 11, fontWeight: "800" },
  evtContent: { padding: spacing.lg },
  evtTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
});
