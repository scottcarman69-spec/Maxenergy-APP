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
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { loginHero } from "@/src/gymPhotos";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

WebBrowser.maybeCompleteAuthSession();

const HERO = loginHero;

const HERO_CHIPS: { lib: "ion" | "mc"; icon: string; l1: string; l2: string }[] = [
  { lib: "mc", icon: "hours-24", l1: "24/7 GYM", l2: "ACCESS" },
  { lib: "mc", icon: "boxing-glove", l1: "MUAY THAI", l2: "KICKBOXING" },
  { lib: "mc", icon: "dumbbell", l1: "BOOT CAMP", l2: "PERSONAL TRAINING" },
  { lib: "ion", icon: "people", l1: "ADULTS & KIDS", l2: "ALL LEVELS" },
];

const FEATURES: { lib: "ion" | "mc"; icon: string; title: string; desc: string }[] = [
  { lib: "ion", icon: "people", title: "All Levels\nWelcome", desc: "Beginners to athletes." },
  { lib: "mc", icon: "boxing-glove", title: "Adults & Kids\nClasses", desc: "Muay Thai & Kickboxing." },
  { lib: "mc", icon: "heart-pulse", title: "More Than\nJust a Gym", desc: "Boot Camp & Personal Training." },
  { lib: "ion", icon: "time-outline", title: "Train Your\nWay", desc: "24/7 access to suit your lifestyle." },
];

function Icon({ lib, name, size, color }: { lib: "ion" | "mc"; name: string; size: number; color: string }) {
  return lib === "mc" ? (
    <MaterialCommunityIcons name={name as any} size={size} color={color} />
  ) : (
    <Ionicons name={name as any} size={size} color={color} />
  );
}

function extractSessionId(url: string): string | null {
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function Login() {
  const router = useRouter();
  const { loginEmail, applyGoogleSessionId, applyAppleAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [aLoading, setALoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

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

  const appleLogin = async () => {
    setErr(null);
    setALoading(true);
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!cred.identityToken) {
        setErr("Apple sign-in failed. Please try again.");
        return;
      }
      const fullName = cred.fullName
        ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ").trim() || null
        : null;
      await applyAppleAuth({
        identity_token: cred.identityToken,
        full_name: fullName,
        email: cred.email ?? null,
      });
      router.replace("/(tabs)/home");
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      setErr(e?.message || "Apple login failed");
    } finally {
      setALoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        {/* HERO */}
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(10,10,11,0.55)", "rgba(10,10,11,0.35)", "rgba(18,18,20,0.92)", "#121214"]}
            locations={[0, 0.4, 0.85, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroInner}>
            <Image
              source={require("../../assets/images/maxenergy-logo.webp")}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.heroEyebrow}>24/7 GYM & FITNESS</Text>
            <Text style={styles.heroHeadline}>IN SMITHFIELD CAIRNS</Text>

            <View style={styles.chipRow}>
              {HERO_CHIPS.map((c, i) => (
                <View key={c.l1} style={[styles.chip, i < HERO_CHIPS.length - 1 && styles.chipDivider]}>
                  <Icon lib={c.lib} name={c.icon} size={22} color={colors.brand} />
                  <Text style={styles.chipL1}>{c.l1}</Text>
                  <Text style={styles.chipL2}>{c.l2}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* HEADLINE */}
        <View style={styles.pitch}>
          <Text style={styles.slamWhite}>TRAIN.</Text>
          <Text style={styles.slamOrange}>GET STRONGER.</Text>
          <Text style={styles.slamWhite}>FEEL YOUR BEST.</Text>
          <View style={styles.brush} />

          {/* 4-col features */}
          <View style={styles.featuresRow}>
            {FEATURES.map((f, i) => (
              <View key={f.title} style={[styles.featureCol, i < FEATURES.length - 1 && styles.featureDivider]}>
                <Icon lib={f.lib} name={f.icon} size={26} color={colors.brand} />
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            ))}
          </View>

          {/* Welcome w/ chevrons */}
          <View style={styles.welcomeRow}>
            <Ionicons name="chevron-forward" size={26} color={colors.brand} style={{ marginRight: -14, opacity: 0.5 }} />
            <Ionicons name="chevron-forward" size={26} color={colors.brand} />
            <View style={styles.welcomeText}>
              <Text style={styles.welcomeStrong}>
                We're a friendly, family-run gym in Smithfield, welcoming everyone from complete beginners to experienced athletes.
              </Text>
              <Text style={styles.welcomeDim}>
                Whatever your age, experience or fitness goals, you'll always be welcome here. Come train, have fun and be part of our gym community.
              </Text>
            </View>
            <Ionicons name="chevron-back" size={26} color={colors.brand} />
            <Ionicons name="chevron-back" size={26} color={colors.brand} style={{ marginLeft: -14, opacity: 0.5 }} />
          </View>
        </View>

        {/* FORM */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>LOG IN TO GET STARTED</Text>

          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={19} color={colors.onSurfaceSecondary} />
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
          </View>

          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.onSurfaceSecondary} />
            <TextInput
              testID="login-password-input"
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry={!showPw}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            <Pressable testID="toggle-password" hitSlop={10} onPress={() => setShowPw((v) => !v)}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={19} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <Pressable
            testID="forgot-password-link"
            hitSlop={8}
            onPress={() => router.push("/(auth)/forgot-password")}
            style={styles.forgotWrap}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {err && <Text style={styles.error}>{err}</Text>}

          <Pressable
            testID="login-submit-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>LOG IN</Text>
                <Ionicons name="arrow-forward" size={19} color={colors.onBrand} />
              </>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
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
                <Ionicons name="logo-google" size={18} color="#EA4335" />
                <Text style={styles.googleBtnText}>CONTINUE WITH GOOGLE</Text>
              </>
            )}
          </Pressable>

          {appleAvailable && (
            aLoading ? (
              <View style={[styles.googleBtn, { backgroundColor: "#000" }]}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                testID="login-apple-button"
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radius.md}
                style={styles.appleBtn}
                onPress={appleLogin}
              />
            )
          )}

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

  hero: { minHeight: 470, justifyContent: "flex-end" },
  heroInner: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: 60 },
  logo: { width: 230, height: 152, alignSelf: "center", marginBottom: spacing.md },
  heroEyebrow: { color: colors.brand, fontFamily: font.display, fontSize: 22, letterSpacing: 0.5, textAlign: "center" },
  heroHeadline: { color: colors.onSurface, fontFamily: font.display, fontSize: 26, letterSpacing: 0.5, marginTop: 2, textAlign: "center" },

  chipRow: {
    flexDirection: "row",
    marginTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: spacing.lg,
  },
  chip: { flex: 1, alignItems: "center", paddingHorizontal: 4, gap: 5 },
  chipDivider: { borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.12)" },
  chipL1: { color: colors.onSurface, fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.4, textAlign: "center" },
  chipL2: { color: colors.onSurfaceSecondary, fontFamily: font.heading, fontSize: 9.5, letterSpacing: 0.4, textAlign: "center", marginTop: -3 },

  pitch: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  slamWhite: { color: colors.onSurface, fontFamily: font.display, fontSize: 38, lineHeight: 50, letterSpacing: 0.5, textAlign: "center" },
  slamOrange: { color: colors.brand, fontFamily: font.display, fontSize: 38, lineHeight: 50, letterSpacing: 0.5, textAlign: "center" },
  brush: {
    width: 150,
    height: 6,
    backgroundColor: colors.brand,
    borderRadius: 3,
    marginTop: spacing.md,
    alignSelf: "center",
    transform: [{ skewX: "-24deg" }],
  },

  featuresRow: { flexDirection: "row", marginTop: spacing.xxl },
  featureCol: { flex: 1, alignItems: "center", paddingHorizontal: 6, gap: 6 },
  featureDivider: { borderRightWidth: 1, borderRightColor: colors.border },
  featureTitle: { color: colors.onSurface, fontFamily: font.heading, fontSize: 12.5, textAlign: "center", lineHeight: 15, marginTop: 2 },
  featureDesc: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", lineHeight: 15 },

  welcomeRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.xxl },
  welcomeText: { flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm },
  welcomeStrong: { color: colors.onSurface, fontFamily: font.semibold, fontSize: 15, lineHeight: 21, textAlign: "center" },
  welcomeDim: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },

  form: { padding: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  formTitle: { color: colors.onSurface, fontFamily: font.display, fontSize: 24, letterSpacing: 0.5, textAlign: "center", marginBottom: spacing.sm },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: "#EFEFF2",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  input: { flex: 1, color: "#18181B", paddingVertical: 15, fontSize: 15, fontFamily: font.medium },
  forgotWrap: { alignSelf: "flex-end", marginTop: -2 },
  forgotText: { color: colors.brand, fontFamily: font.heading, fontSize: 13 },
  error: { color: colors.error, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 17,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 17, letterSpacing: 1 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginVertical: spacing.sm },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1 },
  googleBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
  },
  googleBtnText: { color: colors.onSurface, fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5 },
  appleBtn: { height: 50, width: "100%" },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  linkText: { color: colors.brand, fontFamily: font.heading },
});
