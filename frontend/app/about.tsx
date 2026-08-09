import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { aboutHero, gymPhotos } from "@/src/gymPhotos";

type Member = { name: string; role: string; image: string; bio: string; quals: string[] };
type About = { heading: string; subheading: string; since: string; story: string[]; team: Member[] };

const HERO = aboutHero;

export default function AboutScreen() {
  const router = useRouter();
  const [data, setData] = useState<About | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.about());
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(18,18,20,0.5)", "transparent", "rgba(18,18,20,0.98)"]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
          <SafeAreaView edges={["top"]}>
            <Pressable testID="about-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <Text style={styles.eyebrow}>{data?.since || "Since 2013"}</Text>
            <Text style={styles.title}>{data?.heading || "About Our Team"}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.body}>
            <Text style={styles.sub}>{data?.subheading}</Text>
            {data?.story.map((p, i) => (
              <Text key={i} style={styles.para}>{p}</Text>
            ))}

            <Text style={styles.sectionTitle}>INSIDE OUR GYM</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }} style={{ marginHorizontal: -spacing.xl, paddingHorizontal: spacing.xl }}>
              {gymPhotos.map((src, i) => (
                <Image key={i} source={src} style={styles.galleryImg} contentFit="cover" />
              ))}
            </ScrollView>

            <Text style={styles.sectionTitle}>MEET THE TEAM</Text>
            {data?.team.map((m) => (
              <View key={m.name} style={styles.card}>
                <Image source={m.image} style={styles.avatar} contentFit="cover" />
                <View style={styles.cardBody}>
                  <Text style={styles.name}>{m.name}</Text>
                  <Text style={styles.role}>{m.role}</Text>
                  <Text style={styles.bio}>{m.bio}</Text>
                  <View style={styles.quals}>
                    {m.quals.map((q) => (
                      <View key={q} style={styles.qual}>
                        <Ionicons name="checkmark-circle" size={13} color={colors.brand} />
                        <Text style={styles.qualText}>{q}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            ))}

            <Pressable testID="about-contact-cta" style={styles.cta} onPress={() => router.push("/contact")}>
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
  hero: { height: 260, justifyContent: "flex-end" },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(18,18,20,0.7)", alignItems: "center", justifyContent: "center", marginLeft: spacing.lg, marginTop: spacing.md, position: "absolute" },
  heroBottom: { padding: spacing.xl },
  eyebrow: { color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginBottom: 4 },
  title: { color: colors.onSurface, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 },
  body: { padding: spacing.xl },
  sub: { color: colors.brand, fontSize: 18, fontWeight: "900", marginBottom: spacing.md, letterSpacing: 0.5 },
  para: { color: colors.onSurface, fontSize: 15, lineHeight: 23, marginBottom: spacing.md },
  sectionTitle: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: spacing.lg, marginBottom: spacing.md },
  galleryImg: { width: 260, height: 175, borderRadius: radius.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  avatar: { width: "100%", height: 220 },
  cardBody: { padding: spacing.lg },
  name: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  role: { color: colors.brand, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 2, textTransform: "uppercase" },
  bio: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.sm },
  quals: { marginTop: spacing.md, gap: 6 },
  qual: { flexDirection: "row", alignItems: "center", gap: 6 },
  qualText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  cta: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  ctaText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
