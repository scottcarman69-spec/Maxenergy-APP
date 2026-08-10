import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { loginHero } from "@/src/gymPhotos";
import { Ionicons } from "@expo/vector-icons";

WebBrowser.maybeCompleteAuthSession();

const HERO = loginHero;

function extractSessionId(url: string): string | null {
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Login() {
  const router = useRouter();
  const { loginEmail, applyGoogleSessionId } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sub = Linking.addEventListener("url", (e) => {
      const sid = extractSessionId(e.url || "");
      if (sid) handleSid(sid);
    });
    (async () => {
      const initial = await Linking.getInitialURL();
      if (initial) {
        const sid = extractSessionId(initial);
        if (sid) handleSid(sid);
      }
    })();
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSid = async (sid: string) => {
    try {
      setGLoading(true);
      await applyGoogleSessionId(sid);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Google login failed");
    } finally {
      setGLoading(false);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!email || !password) {
      setErr("Enter your email and password");
      return;
    }
    setLoading(true);
    try {
      await loginEmail(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async () => {
    setErr(null);
    setGLoading(true);
    try {
      const redirectUrl =
        Platform.OS === "web"
          ? typeof window !== "undefined"
            ? window.location.origin + "/"
            : ""
          : Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      let url: string | null = null;
      if (result.type === "success" && (result as any).url) url = (result as any).url;
      if (!url) url = await Linking.getInitialURL();
      if (url) {
        const sid = extractSessionId(url);
        if (sid) {
          await applyGoogleSessionId(sid);
          router.replace("/(tabs)/home");
          return;
        }
      }
    } catch (e: any) {
      setErr(e?.message || "Google login failed");
    } finally {
      setGLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["transparent", "rgba(18,18,20,0.7)", "#121214"]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Image
              source={require("../../assets/images/maxenergy-logo.webp")}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.heroTagline}>{"24/7 Gym & Fitness in Smithfield Cairns"}</Text>
            <Text style={styles.subtitle}>{"Muay Thai • Kickboxing • Boot Camp • Personal Training\nAdults & Kids Classes • All Levels Welcome"}</Text>
          </View>
        </View>

        <View style={styles.pitch}>
          <Text style={styles.pitchTitle}>Train. Get Stronger. Feel Your Best.</Text>
          <Text style={styles.pitchBody}>
            {"We're a friendly, family-run gym in Smithfield, welcoming everyone from complete beginners to experienced athletes. Enjoy 24/7 gym access, Muay Thai & Kickboxing for adults and kids, Boot Camp and Personal Training.\n\nWhatever your age, experience or fitness goals, you'll always be welcome here. Come train, have fun and be part of our gym community."}
          </Text>

          <View style={styles.features}>
            {[
              { icon: "calendar", title: "Live Timetable", desc: "See kids & adult classes and book your spot" },
              { icon: "card", title: "Easy Membership", desc: "Apply & pay online — no paperwork, no queues" },
              { icon: "megaphone", title: "Gym Notices", desc: "Stay across events, gradings & updates" },
              { icon: "star", title: "5-Star Community", desc: "Join a crew that trains hard and lifts each other up" },
            ].map((f) => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon as any} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>Log in to get started</Text>

          <TextInput
            testID="login-email-input"
            placeholder="Email"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            testID="login-password-input"
            placeholder="Password"
            placeholderTextColor={colors.onSurfaceSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />
          {err && <Text style={styles.error}>{err}</Text>}

          <Pressable
            testID="forgot-password-link"
            hitSlop={8}
            onPress={() => router.push("/(auth)/forgot-password")}
            style={styles.forgotWrap}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            testID="login-submit-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>LOG IN</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <Pressable
            testID="login-google-button"
            style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.9 }]}
            onPress={googleLogin}
            disabled={gLoading}
          >
            {gLoading ? (
              <ActivityIndicator color={colors.onSurface} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.onSurface} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={type.bodyDim}>New here? </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable testID="go-register-link">
                <Text style={styles.linkText}>Create an account</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 340, justifyContent: "flex-end" },
  heroText: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  logo: { width: 250, height: 166, marginLeft: -8, marginBottom: spacing.sm },
  heroTagline: { color: colors.onSurface, fontFamily: font.semibold, fontSize: 15, marginTop: spacing.xs },
  pitch: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  pitchTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 26, letterSpacing: 0.3, marginBottom: spacing.sm },
  pitchBody: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  features: { marginTop: spacing.lg, gap: spacing.md },
  featureRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  featureIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  featureTitle: { color: colors.onSurface, fontFamily: font.heading, fontSize: 15 },
  featureDesc: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 1 },
  brandEyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  title: { color: colors.onSurface, fontSize: 40, fontWeight: "900", lineHeight: 42, letterSpacing: -1 },
  subtitle: { color: colors.onSurfaceSecondary, marginTop: spacing.md, fontSize: 14 },
  form: { padding: spacing.xl, gap: spacing.md },
  formTitle: { ...type.h2, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    fontSize: 15,
  },
  error: { color: colors.error, fontSize: 13 },
  forgotWrap: { alignSelf: "flex-end", marginTop: 2 },
  forgotText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.md },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  googleBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
  },
  googleBtnText: { color: colors.onSurface, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  linkText: { color: colors.brand, fontWeight: "700" },
});
