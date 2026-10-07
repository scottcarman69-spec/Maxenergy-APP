import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import ReviewsFrame from "@/src/components/ReviewsFrame";
import { colors, spacing, type } from "@/src/theme";

const WIDGET_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/reviews-widget`;

export default function Reviews() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0); // bump to force-remount the frame on retry

  // Safety net: reveal the widget after a short grace period in case a load
  // event doesn't fire, so the member never gets stuck on an endless spinner.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 4500);
    return () => clearTimeout(t);
  }, [loading, key]);

  const reload = () => {
    setFailed(false);
    setLoading(true);
    setKey((k) => k + 1);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="reviews-back" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Reviews</Text>
          <Text style={styles.subtitle}>What our members say</Text>
        </View>
        <Ionicons name="star" size={22} color={colors.brand} />
      </View>

      <View style={styles.body}>
        {failed ? (
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.brand} />
            <Text style={styles.errTitle}>Couldn{"'"}t load reviews</Text>
            <Text style={styles.errText}>Please check your connection and try again.</Text>
            <Pressable testID="reviews-retry" onPress={reload} style={styles.retryBtn}>
              <Ionicons name="refresh" size={16} color={colors.onBrand} />
              <Text style={styles.retryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ReviewsFrame
              key={key}
              uri={WIDGET_URL}
              onLoaded={() => setLoading(false)}
              onFailed={() => { setLoading(false); setFailed(true); }}
            />
            {loading && (
              <View style={styles.overlay} pointerEvents="none">
                <ActivityIndicator color={colors.brand} size="large" />
                <Text style={styles.loadingText}>Loading reviews…</Text>
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface,
  },
  backBtn: { padding: 2 },
  title: { ...type.h1 },
  subtitle: { ...type.small, marginTop: 2 },
  body: { flex: 1, backgroundColor: colors.surface },
  overlay: {
    ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, gap: spacing.md,
  },
  loadingText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  errTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", marginTop: spacing.sm },
  errText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center" },
  retryBtn: {
    marginTop: spacing.md, backgroundColor: colors.brand, paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 10, flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  retryText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
