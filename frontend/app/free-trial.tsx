import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";

const TRIALS = [
  { category: "Kids", icon: "happy", blurb: "Ages 6-16 · Muay Thai · Mon & Thu 5:00pm", accent: "#22C55E" },
  { category: "Adults", icon: "flame", blurb: "Muay Thai, Kickboxing & more · all levels", accent: colors.brand },
];

export default function FreeTrial() {
  const router = useRouter();
  const [claimed, setClaimed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.myTrials();
      setClaimed(r.claimed || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const claim = async (category: string) => {
    setMsg(null);
    setBusy(category);
    try {
      await api.claimTrial(category);
      setClaimed((c) => [...c, category]);
      setMsg(`🎉 Your free ${category} trial is confirmed! Check your email and notifications.`);
    } catch (e: any) {
      setMsg(e?.message || "Could not claim trial");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="trial-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Free Trial</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <Text style={styles.hero}>Try your first class on us.</Text>
          <Text style={styles.sub}>Claim one free trial class — no payment, no commitment. Each member gets one Kids and one Adults trial.</Text>

          {TRIALS.map((t) => {
            const isClaimed = claimed.includes(t.category);
            return (
              <View key={t.category} style={styles.card}>
                <View style={[styles.icon, { backgroundColor: t.accent + "22" }]}>
                  <Ionicons name={t.icon as any} size={24} color={t.accent} />
                </View>
                <Text style={styles.cardTitle}>{t.category} Free Trial</Text>
                <Text style={styles.cardBlurb}>{t.blurb}</Text>
                {isClaimed ? (
                  <View style={styles.claimedPill}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.claimedText}>Already claimed</Text>
                  </View>
                ) : (
                  <Pressable
                    testID={`claim-trial-${t.category.toLowerCase()}`}
                    style={styles.claimBtn}
                    onPress={() => claim(t.category)}
                    disabled={busy === t.category}
                  >
                    {busy === t.category ? (
                      <ActivityIndicator color={colors.onBrand} />
                    ) : (
                      <>
                        <Ionicons name="gift" size={16} color={colors.onBrand} />
                        <Text style={styles.claimText}>CLAIM FREE {t.category.toUpperCase()} TRIAL</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          {msg && <Text style={styles.msg}>{msg}</Text>}
          <Pressable testID="trial-view-schedule" style={styles.secondary} onPress={() => router.push("/(tabs)/timetable")}>
            <Text style={styles.secondaryText}>View class schedule</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  hero: { ...type.h1, marginTop: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.display, letterSpacing: 0.3, marginTop: spacing.xs },
  cardBlurb: { color: colors.onSurfaceSecondary, fontSize: 13 },
  claimBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  claimText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5 },
  claimedPill: { marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  claimedText: { color: colors.success, fontFamily: font.semibold, fontSize: 13 },
  msg: { color: colors.brand, fontFamily: font.semibold, textAlign: "center", marginTop: spacing.sm },
  secondary: { alignItems: "center", paddingVertical: spacing.md },
  secondaryText: { color: colors.onSurfaceSecondary, fontFamily: font.semibold, textDecorationLine: "underline" },
});
