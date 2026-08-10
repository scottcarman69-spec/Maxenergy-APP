import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { teamPhotos } from "@/src/gymPhotos";

type Member = { name: string; role: string; image: string; bio: string; quals: string[] };

// Match a class trainer string (e.g. "Coach Alex") to an About team member.
function matchMember(team: Member[], trainer: string): Member | null {
  const t = (trainer || "").toLowerCase().replace(/coach/g, "").trim();
  if (!t) return null;
  const core = t.split(/\s+/)[0];
  for (const m of team) {
    const nm = m.name.toLowerCase();
    if (nm.includes(core) || t.includes(nm.split(/\s+/)[0])) return m;
  }
  return null;
}

export default function CoachScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.about();
      setTeam(d?.team || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const coach = useMemo(() => matchMember(team, String(name || "")), [team, name]);
  const displayName = coach?.name || String(name || "Coach");
  const avatar = coach ? (teamPhotos[coach.name] || { uri: coach.image }) : (teamPhotos["Alex Honorato"]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Image source={avatar} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(18,18,20,0.35)", "transparent", "rgba(18,18,20,0.98)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]} style={styles.backSafe} pointerEvents="box-none">
            <Pressable
              testID="coach-back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/timetable"))}
              hitSlop={12}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            {!!coach?.role && <Text style={styles.eyebrow}>{coach.role}</Text>}
            <Text style={styles.title}>{displayName}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.body}>
            {coach ? (
              <>
                <Text style={styles.sectionTitle}>ABOUT</Text>
                <Text style={styles.bio}>{coach.bio}</Text>

                {coach.quals?.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>QUALIFICATIONS</Text>
                    <View style={styles.quals}>
                      {coach.quals.map((q) => (
                        <View key={q} style={styles.qual}>
                          <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                          <Text style={styles.qualText}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </>
            ) : (
              <Text style={styles.bio}>Profile details coming soon.</Text>
            )}

            <Pressable testID="coach-contact-cta" style={styles.cta} onPress={() => router.push("/contact")}>
              <Ionicons name="call" size={18} color={colors.onBrand} />
              <Text style={styles.ctaText}>GET IN TOUCH</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 340, justifyContent: "flex-end" },
  backSafe: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 30 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(18,18,20,0.7)", alignItems: "center", justifyContent: "center", marginLeft: spacing.lg, marginTop: spacing.md, zIndex: 20 },
  heroBottom: { padding: spacing.xl },
  eyebrow: { color: colors.brand, fontSize: 12, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  body: { padding: spacing.xl },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: spacing.lg, marginBottom: spacing.md },
  bio: { color: colors.onSurface, fontSize: 15, lineHeight: 23 },
  quals: { gap: 10 },
  qual: { flexDirection: "row", alignItems: "center", gap: 8 },
  qualText: { color: colors.onSurfaceTertiary, fontSize: 14, flex: 1 },
  cta: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  ctaText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
