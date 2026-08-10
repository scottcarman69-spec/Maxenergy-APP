import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function Verify() {
  const router = useRouter();
  const { refresh } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = (params.email || "").toString().toLowerCase();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timerRef.current = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const verify = async () => {
    setErr(null);
    setInfo(null);
    if (code.trim().length !== 6) {
      setErr("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    try {
      await api.verifyOtp(email, code.trim());
      await refresh();
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);
    setResending(true);
    try {
      await api.resendOtp(email);
      setInfo("We've sent you a fresh code. Check your inbox.");
      setCooldown(30);
    } catch (e: any) {
      setErr(e?.message || "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.header}>
        <Pressable testID="verify-later" hitSlop={12} onPress={() => router.replace("/(tabs)/home")}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="mail-unread-outline" size={34} color={colors.brand} />
        </View>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We've emailed a 6-digit code to{"\n"}
          <Text style={styles.emailText}>{email}</Text>
        </Text>

        <TextInput
          testID="verify-code-input"
          placeholder="------"
          placeholderTextColor={colors.onSurfaceTertiary}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
          style={styles.codeInput}
          autoFocus
        />

        {err && <Text style={styles.error}>{err}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <Pressable
          testID="verify-submit-button"
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={verify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <Text style={styles.primaryBtnText}>VERIFY EMAIL</Text>
          )}
        </Pressable>

        <View style={styles.resendRow}>
          <Text style={type.bodyDim}>Didn't get it? </Text>
          <Pressable testID="verify-resend" onPress={resend} disabled={resending || cooldown > 0}>
            <Text style={[styles.linkText, (resending || cooldown > 0) && { opacity: 0.5 }]}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending…" : "Resend code"}
            </Text>
          </Pressable>
        </View>

        <Pressable testID="verify-skip" onPress={() => router.replace("/(tabs)/home")}>
          <Text style={styles.skipText}>I'll verify later</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md },
  body: { paddingHorizontal: spacing.xl, alignItems: "center" },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: { ...type.h2, textAlign: "center" },
  subtitle: { ...type.bodyDim, textAlign: "center", marginTop: spacing.sm, lineHeight: 21 },
  emailText: { color: colors.onSurface, fontFamily: font.semibold },
  codeInput: {
    alignSelf: "stretch",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    paddingVertical: 18,
    borderRadius: radius.md,
    fontSize: 30,
    letterSpacing: 12,
    textAlign: "center",
    marginTop: spacing.xl,
    fontFamily: font.heading,
  },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.md, textAlign: "center" },
  info: { color: colors.success, fontSize: 13, marginTop: spacing.md, textAlign: "center" },
  primaryBtn: {
    alignSelf: "stretch",
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
  resendRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.xl },
  linkText: { color: colors.brand, fontWeight: "700" },
  skipText: { color: colors.onSurfaceSecondary, marginTop: spacing.xl, textDecorationLine: "underline" },
});
