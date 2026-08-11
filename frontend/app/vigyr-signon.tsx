import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

const VIGYR_URL = "https://signon.vigyr.com/online-sign-on/form/CUSTOMER/75-MaxenergyFitness";

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
        <Text style={styles.headerTitle}>Join Maxenergy Fitness</Text>
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
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageTitle}>Choose How You'd Like to Join</Text>
          <Text style={styles.pageSub}>Please select the option that best suits you.</Text>

          {/* Option 1 — Direct Debit */}
          <View style={[styles.optionCard, { borderColor: colors.brand }]}>
            <View style={styles.optTopRow}>
              <View style={styles.optIcon}>
                <Ionicons name="repeat" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>6 or 12 Month Membership</Text>
                <Text style={styles.optTag}>Direct Debit</Text>
              </View>
            </View>

            <View style={styles.newBadge}>
              <Ionicons name="sparkles" size={12} color={colors.brand} />
              <Text style={styles.newBadgeText}>New members only</Text>
            </View>

            <Text style={styles.optBody}>
              Use this option if you are signing up for a 6-month or 12-month membership and would like to pay by direct debit.
            </Text>
            <Text style={styles.optBody}>
              You'll be redirected to our secure membership registration and payment page to complete your sign-up.
            </Text>

            <View style={styles.secureBox}>
              <View style={styles.secureHead}>
                <Ionicons name="lock-closed" size={15} color="#22C55E" />
                <Text style={styles.secureTitle}>Your Information Is Secure</Text>
              </View>
              <Text style={styles.secureText}>
                Your banking or credit card information is entered and processed securely through our payment provider.
              </Text>
              <Text style={styles.secureText}>
                Your payment details are not stored within the Maxenergy Fitness app. We do not have access to or keep your banking or credit card information.
              </Text>
            </View>

            <Pressable
              testID="vigyr-start"
              style={({ pressed }) => [styles.primaryBtn, { marginTop: spacing.lg }, pressed && { opacity: 0.9 }]}
              onPress={startSignUp}
              disabled={opening}
            >
              {opening ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>SET UP MEMBERSHIP DIRECT DEBIT</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onBrand} />
                </>
              )}
            </Pressable>
          </View>

          {/* Option 2 — Upfront Payments & Bookings */}
          <View style={styles.optionCard}>
            <View style={styles.optTopRow}>
              <View style={styles.optIcon}>
                <Ionicons name="card-outline" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>Upfront Payments & Bookings</Text>
              </View>
            </View>

            <Text style={styles.optBody}>
              Want to pay upfront, purchase a class or make a booking?
            </Text>
            <Text style={styles.optBody}>
              These payments are processed securely through Square and do not require you to complete the direct debit membership form.
            </Text>

            <Text style={styles.useForLabel}>Use this option for:</Text>
            <View style={styles.useList}>
              {[
                "Upfront membership payments",
                "Casual classes",
                "Class passes",
                "Bookings",
                "Other one-time payments",
              ].map((item) => (
                <View key={item} style={styles.useRow}>
                  <Ionicons name="checkmark-circle" size={17} color={colors.brand} />
                  <Text style={styles.useText}>{item}</Text>
                </View>
              ))}
            </View>

            <Pressable
              testID="vigyr-upfront"
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push("/memberships")}
            >
              <Ionicons name="pricetags" size={18} color={colors.brand} />
              <Text style={styles.outlineBtnText}>VIEW UPFRONT PAYMENTS & BOOKINGS</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, alignItems: "center" },
  scrollBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  pageTitle: { color: colors.onSurface, fontSize: 24, fontFamily: font.display, letterSpacing: -0.3 },
  pageSub: { color: colors.onSurfaceSecondary, fontSize: 14.5, marginTop: 6, marginBottom: spacing.lg },

  optionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  optTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  optIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  optTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  optTag: { color: colors.brand, fontSize: 12.5, fontFamily: font.semibold, letterSpacing: 0.5, marginTop: 2 },
  newBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, marginTop: spacing.md },
  newBadgeText: { color: colors.brand, fontSize: 11.5, fontFamily: font.semibold, letterSpacing: 0.3 },
  optBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.md },

  secureBox: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: "#22C55E44", padding: spacing.md, marginTop: spacing.lg, gap: 6 },
  secureHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  secureTitle: { color: colors.onSurface, fontSize: 14, fontFamily: font.heading },
  secureText: { color: colors.onSurfaceSecondary, fontSize: 12.5, lineHeight: 18 },

  useForLabel: { color: colors.onSurface, fontSize: 14, fontFamily: font.heading, marginTop: spacing.lg },
  useList: { marginTop: spacing.sm, gap: 8 },
  useRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  useText: { color: colors.onSurface, fontSize: 14 },

  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { color: colors.onSurface, fontSize: 26, fontFamily: font.display, textAlign: "center" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14.5, lineHeight: 21, textAlign: "center", marginTop: spacing.sm },
  confirmCard: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl },
  confirmQ: { color: colors.onSurface, fontSize: 15, fontFamily: font.medium, textAlign: "center" },
  reportedCard: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: "#22C55E55", padding: spacing.lg, marginTop: spacing.xl },
  reportedText: { flex: 1, color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  primaryBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: colors.brand, paddingVertical: 16, paddingHorizontal: spacing.md, borderRadius: radius.md },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 0.6, textAlign: "center" },
  outlineBtn: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1.5, borderColor: colors.brand, paddingVertical: 15, paddingHorizontal: spacing.md, borderRadius: radius.md, marginTop: spacing.lg },
  outlineBtnText: { color: colors.brand, fontFamily: font.display, fontSize: 14.5, letterSpacing: 0.5, textAlign: "center" },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: spacing.xs },
  secondaryBtnText: { color: colors.brand, fontSize: 14, fontWeight: "700" },
  doneLink: { marginTop: spacing.lg, paddingVertical: 10 },
  doneLinkText: { color: colors.onSurfaceSecondary, fontSize: 14, textDecorationLine: "underline" },
});
