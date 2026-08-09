import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";
import { gymPhotoByService } from "@/src/gymPhotos";

type Service = { key: string; title: string; icon: string; image: string; desc: string };

export default function Services() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.services();
      setServices(r.services || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="services-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Our Services</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <Text style={styles.intro}>Everything you need to reach your fitness goals, all under one roof in Smithfield.</Text>
          {services.map((s) => (
            <View key={s.key} testID={`service-${s.key}`} style={styles.card}>
              <View style={styles.imgWrap}>
                <Image source={gymPhotoByService[s.key] || s.image} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(18,18,20,0.9)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.iconBadge}>
                  <Ionicons name={s.icon as any} size={18} color={colors.onBrand} />
                </View>
                <Text style={styles.cardTitle}>{s.title}</Text>
              </View>
              <Text style={styles.cardDesc}>{s.desc}</Text>
            </View>
          ))}

          <Pressable testID="services-membership-cta" style={styles.cta} onPress={() => router.push("/membership")}>
            <Ionicons name="card" size={18} color={colors.onBrand} />
            <Text style={styles.ctaText}>JOIN NOW</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  intro: { ...type.bodyDim, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  imgWrap: { height: 150, justifyContent: "flex-end" },
  iconBadge: { position: "absolute", top: spacing.md, left: spacing.md, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", padding: spacing.lg, paddingBottom: spacing.md },
  cardDesc: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, padding: spacing.lg, paddingTop: spacing.md },
  cta: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  ctaText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
