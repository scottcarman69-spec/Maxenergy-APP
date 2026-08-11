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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState(""); // DD/MM/YYYY
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onDobChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setDob(out);
  };

  // Returns YYYY-MM-DD if valid, else null.
  const parseDob = (v: string): string | null => {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) return null;
    const today = new Date();
    if (d > today) return null;
    let age = today.getFullYear() - d.getFullYear();
    const mo = today.getMonth() - d.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < d.getDate())) age--;
    if (age < 5 || age > 100) return null;
    return `${yyyy}-${mm}-${dd}`;
  };

  const submit = async () => {
    setErr(null);
    if (!firstName.trim() || !lastName.trim()) {
      setErr("Please enter your first and last name");
      return;
    }
    const isoDob = parseDob(dob);
    if (!isoDob) {
      setErr("Enter a valid date of birth (DD/MM/YYYY)");
      return;
    }
    if (!email || password.length < 6) {
      setErr("Enter email and a password (min 6 chars)");
      return;
    }
    setLoading(true);
    try {
      await registerEmail({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: isoDob,
        email: email.trim(),
        password,
      });
      router.replace({ pathname: "/(auth)/verify", params: { email: email.trim().toLowerCase() } });
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
            testID="register-first-name-input"
            placeholder="First name"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="words"
            value={firstName}
            onChangeText={setFirstName}
            style={styles.input}
          />
          <TextInput
            testID="register-last-name-input"
            placeholder="Last name"
            placeholderTextColor={colors.onSurfaceSecondary}
            autoCapitalize="words"
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
          />
          <TextInput
            testID="register-dob-input"
            placeholder="Date of birth (DD/MM/YYYY)"
            placeholderTextColor={colors.onSurfaceSecondary}
            keyboardType="number-pad"
            value={dob}
            onChangeText={onDobChange}
            maxLength={10}
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

          <Text style={styles.consentText}>
            By signing up you agree to our{" "}
            <Text style={styles.linkText} onPress={() => router.push("/privacy")}>Privacy Policy</Text>.
          </Text>

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
  consentText: { color: colors.onSurfaceSecondary, fontSize: 12.5, textAlign: "center", marginTop: spacing.md, lineHeight: 18 },
  linkText: { color: colors.brand, fontWeight: "700" },
});
