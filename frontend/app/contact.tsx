import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Loc = { name: string; address: string; hours: string; map_url: string };

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
  const [locs, setLocs] = useState<Loc[]>([]);

  const load = useCallback(async () => {
    try {
      const [i, l] = await Promise.all([api.gymInfo(), api.locations()]);
      setInfo(i);
      setLocs(l.locations || []);
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
      <ScreenHeader title="Contact & Gym Info" backTestID="contact-back" fallback="/(tabs)/profile" />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={styles.gymName}>{info?.name || "Maxenergy Fitness"}</Text>
        <Text style={styles.tagline}>Your gym in Cairns · Get fit. Feel good.</Text>

        <Pressable testID="contact-message-btn" style={styles.messageBtn} onPress={() => router.push("/chat/gym")}>
          <Ionicons name="chatbubbles" size={19} color={colors.onBrand} />
          <Text style={styles.mapBtnText}>MESSAGE US</Text>
        </Pressable>

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

        <Text style={styles.section}>LOCATIONS</Text>
        <View style={{ gap: spacing.sm }}>
          {locs.map((l) => (
            <Pressable key={l.name} testID={`location-${l.name.toLowerCase()}`} style={styles.locCard} onPress={() => Linking.openURL(l.map_url)}>
              <View style={styles.iconBox}>
                <Ionicons name="business" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowValue}>{l.name}</Text>
                <Text style={styles.locAddr}>{l.address}</Text>
                <Text style={styles.locHours}>{l.hours}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
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
          <Ionicons name="map" size={18} color={colors.brand} />
          <Text style={styles.mapBtnOutlineText}>OPEN IN MAPS</Text>
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
  locCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  locAddr: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3, lineHeight: 17 },
  locHours: { color: colors.brand, fontSize: 12, fontWeight: "700", marginTop: 3 },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 2, marginTop: spacing.xl, marginBottom: spacing.md },
  socialRow: { flexDirection: "row", gap: spacing.md },
  social: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  socialText: { color: colors.onSurface, fontWeight: "700" },
  messageBtn: { marginTop: spacing.xl, backgroundColor: colors.brand, padding: spacing.lg, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  mapBtn: { marginTop: spacing.md, backgroundColor: "transparent", padding: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  mapBtnText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  mapBtnOutlineText: { color: colors.brand, fontWeight: "900", letterSpacing: 1 },
});
