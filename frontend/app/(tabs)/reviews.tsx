import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";

type Review = { author_name?: string; profile_photo?: string; rating?: number; text?: string; relative_time?: string };
type Data = { source: string; rating: number | null; total: number | null; reviews: Review[]; write_url: string; view_url: string };

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= Math.round(n) ? "star" : "star-outline"} size={size} color={colors.brand} />
      ))}
    </View>
  );
}

export default function Reviews() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.reviews());
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
        <Text style={styles.title}>Reviews</Text>
        <Text style={styles.subtitle}>What our members say</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40, gap: spacing.md }}
          refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Summary */}
          <View style={styles.summary}>
            <Ionicons name="logo-google" size={22} color={colors.onSurface} />
            {data?.rating ? (
              <>
                <Text style={styles.ratingNum}>{data.rating.toFixed(1)}</Text>
                <Stars n={data.rating} size={18} />
                <Text style={styles.total}>{data.total} Google reviews</Text>
              </>
            ) : (
              <Text style={styles.summaryText}>Rated by our members on Google</Text>
            )}
          </View>

          {/* Actions */}
          <Pressable testID="write-review-btn" style={styles.writeBtn} onPress={() => data && Linking.openURL(data.write_url)}>
            <Ionicons name="create" size={18} color={colors.onBrand} />
            <Text style={styles.writeText}>WRITE A REVIEW</Text>
          </Pressable>
          <Pressable testID="view-google-btn" style={styles.viewBtn} onPress={() => data && Linking.openURL(data.view_url)}>
            <Ionicons name="logo-google" size={16} color={colors.onSurface} />
            <Text style={styles.viewText}>See all reviews on Google</Text>
          </Pressable>

          {/* Review list */}
          {data && data.reviews.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>RECENT REVIEWS</Text>
              {data.reviews.map((r, i) => (
                <View key={i} testID={`review-${i}`} style={styles.card}>
                  <View style={styles.cardTop}>
                    {r.profile_photo ? (
                      <Image source={r.profile_photo} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>{(r.author_name || "?").slice(0, 1)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.author}>{r.author_name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <Stars n={r.rating || 0} />
                        <Text style={styles.when}>{r.relative_time}</Text>
                      </View>
                    </View>
                  </View>
                  {!!r.text && <Text style={styles.reviewText}>{r.text}</Text>}
                </View>
              ))}
              <Text style={styles.attribution}>Up to 5 reviews, sorted by Google relevance.</Text>
            </>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="star" size={30} color={colors.brand} />
              <Text style={styles.emptyTitle}>Love training with us?</Text>
              <Text style={styles.emptyText}>Tap “Write a Review” to share your experience on Google and help others find us.</Text>
            </View>
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
  summary: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: "center", gap: spacing.sm },
  ratingNum: { color: colors.onSurface, fontSize: 44, fontFamily: font.display, letterSpacing: 0.5 },
  total: { color: colors.onSurfaceSecondary, fontSize: 13 },
  summaryText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  writeBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  writeText: { color: colors.onBrand, fontFamily: font.heading, letterSpacing: 1 },
  viewBtn: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  viewText: { color: colors.onSurface, fontFamily: font.semibold },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5, marginTop: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTop: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.onBrand, fontFamily: font.display, fontSize: 18 },
  author: { color: colors.onSurface, fontFamily: font.semibold, fontSize: 15 },
  when: { color: colors.onSurfaceSecondary, fontSize: 11 },
  reviewText: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.md },
  attribution: { color: colors.info, fontSize: 11, textAlign: "center", marginTop: spacing.sm },
  emptyCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  emptyTitle: { color: colors.onSurface, fontFamily: font.heading, fontSize: 18, marginTop: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
