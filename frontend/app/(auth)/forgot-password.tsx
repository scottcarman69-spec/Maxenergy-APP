import React, { useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const { loginEmail } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = async () => {
    setErr(null);
    setInfo(null);
    if (!email.trim()) {
      setErr("Enter your email address");
      return;
    }
    setLoading(true);
    try {
      const r = await api.forgotPassword(email.trim().toLowerCase());
      if (r && r.google) {
        setErr(null);
        setInfo(
          "This email is registered with Google sign-in, so there's no password to reset. Go back and tap \"Continue with Google\" to log in."
        );
        return;
      }
      setInfo("If an account exists, a reset code is on its way. Check your inbox (and spam).");
      setStep(2);
    } catch (e: any) {
      setErr(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setErr(null);
    setInfo(null);
    if (code.trim().length !== 6) {
      setErr("Enter the 6-digit code from your email");
      return;
    }
    if (password.length < 6) {
      setErr("New password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      const em = email.trim().toLowerCase();
      await api.resetPassword(em, code.trim(), password);
      // Log straight in with the new password.
      await loginEmail(em, password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.header}>
          <Pressable
            testID="forgot-back"
            hitSlop={12}
            onPress={() => (step === 2 ? setStep(1) : router.back())}
          >
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <View style={styles.iconWrap}>
            <Ionicons name="lock-closed-outline" size={32} color={colors.brand} />
          </View>
          <Text style={styles.title}>
            {step === 1 ? "Forgot password?" : "Set a new password"}
          </Text>
          <Text style={styles.subtitle}>
            {step === 1
              ? "Enter your account email and we'll send you a 6-digit reset code."
              : `Enter the code sent to ${email.trim().toLowerCase()} and choose a new password.`}
          </Text>

          {step === 1 ? (
            <TextInput
              testID="forgot-email-input"
              placeholder="Email"
              placeholderTextColor={colors.onSurfaceSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
            />
          ) : (
            <>
              <TextInput
                testID="reset-code-input"
                placeholder="6-digit code"
                placeholderTextColor={colors.onSurfaceSecondary}
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ""))}
                style={[styles.input, styles.codeInput]}
              />
              <TextInput
                testID="reset-password-input"
                placeholder="New password (min 6)"
                placeholderTextColor={colors.onSurfaceSecondary}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />
            </>
          )}

          {err && <Text style={styles.error}>{err}</Text>}
          {info && <Text style={styles.info}>{info}</Text>}

          <Pressable
            testID="forgot-submit-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={step === 1 ? sendCode : resetPassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {step === 1 ? "SEND CODE" : "RESET PASSWORD"}
              </Text>
            )}
          </Pressable>

          {step === 2 && (
            <Pressable testID="forgot-resend" onPress={sendCode} disabled={loading}>
              <Text style={styles.resendText}>Resend code</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md },
  body: { paddingHorizontal: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { ...type.h2 },
  subtitle: { ...type.bodyDim, marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 21 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: "center", fontFamily: font.heading },
  error: { color: colors.error, fontSize: 13, marginBottom: spacing.sm },
  info: { color: colors.success, fontSize: 13, marginBottom: spacing.sm },
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
  resendText: { color: colors.brand, fontWeight: "700", textAlign: "center", marginTop: spacing.xl },
});
