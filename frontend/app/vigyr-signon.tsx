import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

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
      <ScreenHeader title="Join Maxenergy Fitness" backTestID="vigyr-back" />

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
          {/* New Member Registration notice */}
          <View style={styles.noticeCard}>
            <View style={styles.noticeHead}>
              <View style={styles.noticeIcon}>
                <Ionicons name="clipboard" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.noticeTitle}>New here? Register once</Text>
                <Text style={styles.noticeSub}>We'll set up your details and door access — you won't need to do this again.</Text>
              </View>
            </View>
            <View style={styles.noticeSecure}>
              <Ionicons name="lock-closed" size={14} color="#22C55E" />
              <Text style={styles.noticeSecureText}>
                Payments are processed securely by our providers. Card & banking details are never stored in the app.
              </Text>
            </View>
          </View>

          <Text style={styles.pageTitle}>Choose how you'd like to join</Text>
          <Text style={styles.pageSub}>Pick the option that suits you best.</Text>

          {/* Option 1 — Upfront Payments & Bookings (primary) */}
          <View style={[styles.optionCard, styles.optionCardPrimary]}>
            <View style={styles.optTopRow}>
              <View style={styles.optIcon}>
                <Ionicons name="card-outline" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>Upfront Payments & Bookings</Text>
                <Text style={styles.optTag}>Pay as you go · via Square</Text>
              </View>
            </View>

            <Text style={styles.optBody}>
              Pay upfront, grab a class pass or make a booking — no membership form needed.
            </Text>

            <Text style={styles.useForLabel}>Great for:</Text>
            <View style={styles.useList}>
              {[
                "Upfront membership payments",
                "Casual classes & class passes",
                "Bookings & one-off payments",
              ].map((item) => (
                <View key={item} style={styles.useRow}>
                  <Ionicons name="checkmark-circle" size={17} color={colors.brand} />
                  <Text style={styles.useText}>{item}</Text>
                </View>
              ))}
            </View>

            <Pressable
              testID="vigyr-upfront"
              style={({ pressed }) => [styles.primaryBtn, { marginTop: spacing.lg }, pressed && { opacity: 0.9 }]}
              onPress={() => router.push("/memberships")}
            >
              <Ionicons name="pricetags" size={18} color={colors.onBrand} />
              <Text style={styles.primaryBtnText}>VIEW UPFRONT PAYMENTS & BOOKINGS</Text>
            </Pressable>
          </View>

          {/* Option 2 — Direct Debit */}
          <View style={styles.optionCard}>
            <View style={styles.optTopRow}>
              <View style={styles.optIcon}>
                <Ionicons name="repeat" size={22} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optTitle}>6 or 12 Month Membership</Text>
                <Text style={styles.optTag}>Direct Debit</Text>
              </View>
              <View style={styles.newBadge}>
                <Ionicons name="sparkles" size={12} color={colors.brand} />
                <Text style={styles.newBadgeText}>New members</Text>
              </View>
            </View>

            <Text style={styles.optBody}>
              Signing up for a 6 or 12-month membership on direct debit? You'll head to our secure registration & payment page to finish up.
            </Text>

            <View style={styles.noticeSecure}>
              <Ionicons name="lock-closed" size={14} color="#22C55E" />
              <Text style={styles.noticeSecureText}>
                Banking details are entered and processed by our payment provider — never stored in the app.
              </Text>
            </View>

            <Pressable
              testID="vigyr-start"
              style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.85 }]}
              onPress={startSignUp}
              disabled={opening}
            >
              {opening ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <>
                  <Text style={styles.outlineBtnText}>SET UP DIRECT DEBIT MEMBERSHIP</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.brand} />
                </>
              )}
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

  noticeCard: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.brand,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  noticeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  noticeTitle: { color: colors.onSurface, fontSize: 16.5, fontFamily: font.heading },
  noticeSub: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  noticeSecure: { flexDirection: "row", gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: "#22C55E44", padding: spacing.md, marginTop: spacing.md },
  noticeSecureText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12.5, lineHeight: 18 },

  optionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  optionCardPrimary: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.brandTertiary },
  optTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  optIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  optTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  optTag: { color: colors.brand, fontSize: 12.5, fontFamily: font.semibold, letterSpacing: 0.5, marginTop: 2 },
  newBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  newBadgeText: { color: colors.brand, fontSize: 11, fontFamily: font.semibold, letterSpacing: 0.3 },
  optBody: { color: colors.onSurface, fontSize: 14, lineHeight: 20, marginTop: spacing.md },

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
