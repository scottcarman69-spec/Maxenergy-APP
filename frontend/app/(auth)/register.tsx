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
import { Link, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

export default function Register() {
  const router = useRouter();
  const { registerEmail } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!name || !email || password.length < 6) {
      setErr("Enter name, email and password (min 6 chars)");
      return;
    }
    setLoading(true);
    try {
      await registerEmail(name, email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e?.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Link href="/(auth)/login" asChild>
            <Pressable testID="back-to-login" hitSlop={12}>
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </Pressable>
          </Link>
          <Image
            source={require("../../assets/images/maxenergy-logo.webp")}
            style={styles.brandLogo}
            contentFit="contain"
          />
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Create your{"\n"}account</Text>
          <Text style={styles.subtitle}>Join the Maxenergy Fitness community.</Text>

          <TextInput
            testID="register-name-input"
            placeholder="Full name"
            placeholderTextColor={colors.onSurfaceSecondary}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <TextInput
            testID="register-email-input"
            placeholder="Email"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <TextInput
            testID="register-password-input"
            placeholder="Password (min 6)"
            placeholderTextColor={colors.onSurfaceSecondary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          {err && <Text style={styles.error}>{err}</Text>}

          <Pressable
            testID="register-submit-button"
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>SIGN UP</Text>
            )}
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={type.bodyDim}>Already a member? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable testID="go-login-link">
                <Text style={styles.linkText}>Log in</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
  },
  brand: { color: colors.brand, letterSpacing: 3, fontWeight: "800", fontSize: 12 },
  brandLogo: { width: 150, height: 99 },
  body: { padding: spacing.xl, gap: spacing.md },
  title: { ...type.h1, marginTop: spacing.md },
  subtitle: { ...type.bodyDim, marginBottom: spacing.lg },
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
  primaryBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
  footerRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  linkText: { color: colors.brand, fontWeight: "700" },
});
