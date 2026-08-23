import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { PhotoCapture } from "@/src/components/PhotoCapture";
import { api } from "@/src/api";

export default function ReportBug() {
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (message.trim().length < 5) {
      setErr("Please describe the issue in a little more detail.");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitBugReport({
        message: message.trim(),
        screenshot,
        platform: Platform.OS,
        app_version: String(Constants.expoConfig?.version || ""),
      });
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Couldn't send your report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <ScreenHeader title="Report a Bug" backTestID="report-bug-back" fallback="/(tabs)/profile" />
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={34} color={colors.onBrand} />
          </View>
          <Text style={styles.successTitle}>Thanks for the heads up!</Text>
          <Text style={styles.successBody}>
            Your report has been sent to the Maxenergy team. We really appreciate you helping us
            make the app better.
          </Text>
          <Pressable
            testID="report-bug-another"
            style={styles.secondaryBtn}
            onPress={() => { setDone(false); setMessage(""); setScreenshot(null); }}
          >
            <Text style={styles.secondaryBtnText}>Report another</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Report a Bug" backTestID="report-bug-back" fallback="/(tabs)/profile" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <View style={styles.introIcon}>
              <Ionicons name="bug" size={22} color={colors.brand} />
            </View>
            <Text style={styles.introText}>
              Found something not working, or have a suggestion? Tell us what happened and add a
              screenshot if you have one.
            </Text>
          </View>

          <Text style={styles.label}>What went wrong?</Text>
          <TextInput
            testID="report-bug-message"
            value={message}
            onChangeText={setMessage}
            placeholder="Describe the issue or share your feedback…"
            placeholderTextColor={colors.onSurfaceSecondary}
            style={styles.textArea}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Screenshot (optional)</Text>
          <PhotoCapture testID="report-bug-photo" value={screenshot} onChange={setScreenshot} />

          {err && <Text style={styles.error}>{err}</Text>}

          <Pressable
            testID="report-bug-submit"
            style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.primaryBtnText}>SEND REPORT</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  intro: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginBottom: spacing.sm },
  introIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  introText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20 },
  label: { color: colors.onSurface, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, marginTop: spacing.sm },
  textArea: {
    minHeight: 130, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, fontSize: 15, lineHeight: 21,
  },
  error: { color: colors.error, fontSize: 13 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  primaryBtnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  successTitle: { color: colors.onSurface, fontSize: 22, fontFamily: font.heading },
  successBody: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, textAlign: "center" },
  secondaryBtn: { marginTop: spacing.md, paddingVertical: 12, paddingHorizontal: 20, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.brand, fontWeight: "800" },
});
