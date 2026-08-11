import React, { useMemo, useState } from "react";
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
  Modal,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, type } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function Register() {
  const router = useRouter();
  const { registerEmail } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Date of birth via picker (no manual typing).
  const now = new Date();
  const [dobOpen, setDobOpen] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null); // 1-12
  const [year, setYear] = useState<number | null>(null);
  const years = useMemo(() => Array.from({ length: 96 }, (_, i) => now.getFullYear() - 5 - i), []);
  const daysInMonth = month && year ? new Date(year, month, 0).getDate() : 31;
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const dobComplete = day !== null && month !== null && year !== null;
  const dobLabel = dobComplete ? `${pad(day!)} ${MONTHS[month! - 1]} ${year}` : "";
  const dobIso = dobComplete ? `${year}-${pad(month!)}-${pad(day!)}` : null;

  // Password rules
  const pwLen = password.length >= 6;
  const pwNum = /\d/.test(password);
  const pwSym = /[^A-Za-z0-9]/.test(password);
  const pwOk = pwLen && pwNum && pwSym;

  const submit = async () => {
    setErr(null);
    if (!firstName.trim() || !lastName.trim()) {
      setErr("Please enter your first and last name");
      return;
    }
    if (!dobIso) {
      setErr("Please select your date of birth");
      return;
    }
    if (!email.trim()) {
      setErr("Please enter your email");
      return;
    }
    if (!pwOk) {
      setErr("Password needs 6+ characters, a number and a symbol");
      return;
    }
    setLoading(true);
    try {
      await registerEmail({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dobIso,
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

  const Rule = ({ ok, label }: { ok: boolean; label: string }) => (
    <View style={styles.ruleRow}>
      <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={15} color={ok ? colors.success : colors.onSurfaceSecondary} />
      <Text style={[styles.ruleText, ok && { color: colors.success }]}>{label}</Text>
    </View>
  );

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

          <Pressable testID="register-dob-button" style={styles.pickerField} onPress={() => setDobOpen(true)}>
            <Ionicons name="calendar-outline" size={18} color={dobComplete ? colors.onSurface : colors.onSurfaceSecondary} />
            <Text style={[styles.pickerFieldText, !dobComplete && { color: colors.onSurfaceSecondary }]}>
              {dobComplete ? dobLabel : "Select date of birth"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.onSurfaceSecondary} />
          </Pressable>

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

          <View style={styles.pwWrap}>
            <TextInput
              testID="register-password-input"
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceSecondary}
              secureTextEntry={!showPw}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="none"
              importantForAutofill="no"
              value={password}
              onChangeText={setPassword}
              style={styles.pwInput}
            />
            <Pressable testID="toggle-password" onPress={() => setShowPw((s) => !s)} hitSlop={10}>
              <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={20} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          {(password.length > 0 || err) && (
            <View style={styles.rules}>
              <Rule ok={pwLen} label="At least 6 characters" />
              <Rule ok={pwNum} label="At least one number (0-9)" />
              <Rule ok={pwSym} label="At least one symbol (e.g. ! @ #)" />
            </View>
          )}

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

      {/* Date of birth picker */}
      <Modal visible={dobOpen} transparent animationType="slide" onRequestClose={() => setDobOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Date of birth</Text>
              <Pressable testID="dob-close" onPress={() => setDobOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <View style={styles.wheels}>
              <Wheel
                label="Day"
                data={days}
                selected={day}
                render={(v) => pad(v)}
                onSelect={setDay}
                testPrefix="dob-day"
              />
              <Wheel
                label="Month"
                data={Array.from({ length: 12 }, (_, i) => i + 1)}
                selected={month}
                render={(v) => MONTHS[v - 1]}
                onSelect={(v) => { setMonth(v); if (day && day > new Date(year || 2000, v, 0).getDate()) setDay(null); }}
                testPrefix="dob-month"
              />
              <Wheel
                label="Year"
                data={years}
                selected={year}
                render={(v) => String(v)}
                onSelect={setYear}
                testPrefix="dob-year"
              />
            </View>
            <Pressable
              testID="dob-confirm"
              style={[styles.primaryBtn, !dobComplete && { opacity: 0.5 }]}
              disabled={!dobComplete}
              onPress={() => setDobOpen(false)}
            >
              <Text style={styles.primaryBtnText}>{dobComplete ? `CONFIRM · ${dobLabel}` : "SELECT DATE"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Wheel({
  label,
  data,
  selected,
  render,
  onSelect,
  testPrefix,
}: {
  label: string;
  data: number[];
  selected: number | null;
  render: (v: number) => string;
  onSelect: (v: number) => void;
  testPrefix: string;
}) {
  return (
    <View style={styles.wheelCol}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <ScrollView style={styles.wheelScroll} showsVerticalScrollIndicator={false}>
        {data.map((v) => {
          const active = selected === v;
          return (
            <Pressable
              key={v}
              testID={`${testPrefix}-${v}`}
              style={[styles.wheelItem, active && styles.wheelItemActive]}
              onPress={() => onSelect(v)}
            >
              <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>{render(v)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
  pickerField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
  },
  pickerFieldText: { flex: 1, color: colors.onSurface, fontSize: 15 },
  pwWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  pwInput: {
    flex: 1,
    color: colors.onSurface,
    paddingVertical: 14,
    fontSize: 15,
  },
  rules: { gap: 6, marginTop: 2, paddingHorizontal: 2 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleText: { color: colors.onSurfaceSecondary, fontSize: 13 },
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
  // DOB modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  modalTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  wheels: { flexDirection: "row", gap: spacing.md, height: 240 },
  wheelCol: { flex: 1 },
  wheelLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", marginBottom: 6 },
  wheelScroll: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  wheelItem: { paddingVertical: 11, alignItems: "center" },
  wheelItemActive: { backgroundColor: colors.brand },
  wheelItemText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  wheelItemTextActive: { color: colors.onBrand, fontWeight: "900" },
});
