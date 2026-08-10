import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, radius, font } from "@/src/theme";

const VIGYR_URL = "https://signon.vigyr.com/online-sign-on/form/CUSTOMER/75-MaxenergyFitness";

const STEPS = [
  { icon: "person", label: "Your details" },
  { icon: "heart", label: "Health check" },
  { icon: "card", label: "Membership & payment" },
  { icon: "document-text", label: "Terms & signature" },
];

export default function VigyrSignOn() {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const startSignUp = async () => {
    setOpening(true);
    try {
      if (Platform.OS === "web") {
        Linking.openURL(VIGYR_URL);
      } else {
        await WebBrowser.openBrowserAsync(VIGYR_URL, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          toolbarColor: "#121214",
          controlsColor: "#FF7A00",
          showTitle: true,
        });
      }
    } catch {
      Linking.openURL(VIGYR_URL).catch(() => {});
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="vigyr-back" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Membership Sign-Up</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <Image
          source={require("../assets/images/maxenergy-logo.webp")}
          style={styles.logo}
          contentFit="contain"
        />
        <Text style={styles.title}>Become a Member</Text>
        <Text style={styles.subtitle}>
          Complete your official Maxenergy Fitness registration. Your details and payment go straight into our gym system — including your 24/7 door access.
        </Text>

        <View style={styles.stepsCard}>
          {STEPS.map((s, i) => (
            <View key={s.label} style={[styles.stepRow, i < STEPS.length - 1 && styles.stepDivider]}>
              <View style={styles.stepIcon}>
                <Ionicons name={s.icon as any} size={18} color={colors.brand} />
              </View>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.onSurfaceSecondary} />
            </View>
          ))}
        </View>

        <Pressable testID="vigyr-start" style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]} onPress={startSignUp} disabled={opening}>
          {opening ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>START SIGN-UP</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
            </>
          )}
        </Pressable>

        <View style={styles.noteRow}>
          <Ionicons name="lock-closed" size={13} color={colors.onSurfaceSecondary} />
          <Text style={styles.note}>Opens a secure browser where you can safely enter your bank / card details for direct debit.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, alignItems: "center" },
  logo: { width: 180, height: 100, marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontFamily: font.display, textAlign: "center" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14.5, lineHeight: 21, textAlign: "center", marginTop: spacing.sm },
  stepsCard: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14 },
  stepDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepLabel: { flex: 1, color: colors.onSurface, fontSize: 15, fontFamily: font.medium },
  primaryBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.brand, paddingVertical: 17, borderRadius: radius.md, marginTop: spacing.xl },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 17, letterSpacing: 1 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  note: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", flexShrink: 1, lineHeight: 17 },
});
