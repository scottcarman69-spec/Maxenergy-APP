import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

type Evt = {
  event_id: string;
  title: string;
  start_at: string;
  image: string;
  location: string;
  description: string;
};

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function Events() {
  const router = useRouter();
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.events();
      setEvents(r.events || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Events</Text>
        <Text style={styles.subtitle}>{"What's on at Maxenergy"}</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={events}
          keyExtractor={(e) => e.event_id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`event-card-${item.event_id}`}
              onPress={() => router.push({ pathname: "/event/[id]", params: { id: item.event_id } })}
              style={styles.card}
            >
              <Image source={item.image} style={styles.image} contentFit="cover" />
              <LinearGradient
                colors={["transparent", "rgba(18,18,20,0.35)", "rgba(18,18,20,0.95)"]}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{fmt(item.start_at)}</Text>
              </View>
              <View style={styles.content}>
                <Text style={styles.evTitle}>{item.title}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={colors.onSurfaceSecondary} />
                  <Text style={styles.evLoc} numberOfLines={1}>{item.location}</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="megaphone-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No events yet. Check back soon.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { ...type.h1 },
  subtitle: { ...type.small, marginTop: 2 },
  card: { height: 200, borderRadius: radius.lg, overflow: "hidden", justifyContent: "flex-end" },
  image: { ...StyleSheet.absoluteFillObject },
  badge: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.onBrand, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  content: { padding: spacing.lg },
  evTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  evLoc: { color: colors.onSurfaceSecondary, fontSize: 12 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary },
});
