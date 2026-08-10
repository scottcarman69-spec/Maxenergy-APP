import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
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
  const [returned, setReturned] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

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
      setReturned(true);
    }
  };

  const confirmCompleted = async () => {
    setReporting(true);
    try {
      await api.reportVigyrSignup(true);
      setReported(true);
    } catch {
      setReported(true);
    } finally {
      setReporting(false);
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

      {returned ? (
        <View style={styles.body}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-done" size={40} color={colors.brand} />
          </View>
          <Text style={styles.title}>You're all set!</Text>
          <Text style={styles.subtitle}>
            Check your email for confirmation from Maxenergy Fitness. Your details and door access are being set up in our system.
          </Text>

          {reported ? (
            <View style={styles.reportedCard}>
              <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
              <Text style={styles.reportedText}>Thanks! We've let the gym know so they can confirm your membership.</Text>
            </View>
          ) : (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmQ}>Did you finish your sign-up?</Text>
              <Pressable testID="vigyr-confirm-yes" style={({ pressed }) => [styles.primaryBtn, { marginTop: spacing.md }, pressed && { opacity: 0.9 }]} onPress={confirmCompleted} disabled={reporting}>
                {reporting ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color={colors.onBrand} />
                    <Text style={styles.primaryBtnText}>YES, I FINISHED</Text>
                  </>
                )}
              </Pressable>
              <Pressable testID="vigyr-confirm-no" style={styles.secondaryBtn} onPress={startSignUp} disabled={reporting}>
                <Ionicons name="refresh" size={16} color={colors.brand} />
                <Text style={styles.secondaryBtnText}>Not yet — reopen the form</Text>
              </Pressable>
            </View>
          )}

          <Pressable testID="vigyr-done" style={styles.doneLink} onPress={() => router.replace("/(tabs)/home")}>
            <Text style={styles.doneLinkText}>Back to home</Text>
          </Pressable>
        </View>
      ) : (
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
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, alignItems: "center" },
  logo: { width: 180, height: 100, marginBottom: spacing.md },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontFamily: font.display, textAlign: "center" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14.5, lineHeight: 21, textAlign: "center", marginTop: spacing.sm },
  stepsCard: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  stepRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 14 },
  stepDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepLabel: { flex: 1, color: colors.onSurface, fontSize: 15, fontFamily: font.medium },
  confirmCard: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl },
  confirmQ: { color: colors.onSurface, fontSize: 15, fontFamily: font.medium, textAlign: "center" },
  reportedCard: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: "#22C55E55", padding: spacing.lg, marginTop: spacing.xl },
  reportedText: { flex: 1, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  primaryBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.brand, paddingVertical: 17, borderRadius: radius.md, marginTop: spacing.xl },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 17, letterSpacing: 1 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: spacing.xs },
  secondaryBtnText: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  doneLink: { marginTop: spacing.lg, paddingVertical: 10 },
  doneLinkText: { color: colors.onSurfaceSecondary, fontSize: 14, textDecorationLine: "underline" },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  note: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", flexShrink: 1, lineHeight: 17 },
});
