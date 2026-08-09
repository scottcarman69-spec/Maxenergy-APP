import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

type Info = {
  name: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  map_url: string;
  instagram: string;
  facebook: string;
};

export default function Contact() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await api.gymInfo());
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = info
    ? [
        { icon: "call", label: "Phone", value: info.phone, onPress: () => Linking.openURL(`tel:${info.phone.replace(/\s/g, "")}`) },
        { icon: "mail", label: "Email", value: info.email, onPress: () => Linking.openURL(`mailto:${info.email}`) },
        { icon: "location", label: "Address", value: info.address, onPress: () => Linking.openURL(info.map_url) },
        { icon: "time", label: "Hours", value: info.hours, onPress: undefined },
      ]
    : [];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="contact-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Contact & Gym Info</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={styles.gymName}>{info?.name || "Max Energy Muay Thai Academy"}</Text>
        <Text style={styles.tagline}>Your gym in Cairns · Get fit. Feel good.</Text>

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          {rows.map((r) => (
            <Pressable
              key={r.label}
              testID={`contact-${r.label.toLowerCase()}`}
              style={styles.row}
              onPress={r.onPress}
              disabled={!r.onPress}
            >
              <View style={styles.iconBox}>
                <Ionicons name={r.icon as any} size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue}>{r.value}</Text>
              </View>
              {r.onPress && <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />}
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>FOLLOW US</Text>
        <View style={styles.socialRow}>
          <Pressable testID="social-facebook" style={styles.social} onPress={() => info && Linking.openURL(info.facebook)}>
            <Ionicons name="logo-facebook" size={22} color={colors.onSurface} />
            <Text style={styles.socialText}>Facebook</Text>
          </Pressable>
          <Pressable testID="social-instagram" style={styles.social} onPress={() => info && Linking.openURL(info.instagram)}>
            <Ionicons name="logo-instagram" size={22} color={colors.onSurface} />
            <Text style={styles.socialText}>Instagram</Text>
          </Pressable>
        </View>

        <Pressable testID="contact-map-btn" style={styles.mapBtn} onPress={() => info && Linking.openURL(info.map_url)}>
          <Ionicons name="map" size={18} color={colors.onBrand} />
          <Text style={styles.mapBtnText}>OPEN IN MAPS</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  gymName: { ...type.h2, marginTop: spacing.md },
  tagline: { ...type.bodyDim, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600", marginTop: 2 },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.md },
  socialRow: { flexDirection: "row", gap: spacing.md },
  social: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  socialText: { color: colors.onSurface, fontWeight: "700" },
  mapBtn: { marginTop: spacing.xl, backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  mapBtnText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
