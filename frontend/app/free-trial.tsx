import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

const TRIALS = [
  { category: "Kids", icon: "happy", blurb: "Ages 6-16 · Muay Thai · Mon & Thu 5:00pm", accent: "#22C55E" },
  { category: "Adults", icon: "flame", blurb: "Muay Thai, Kickboxing & more · all levels", accent: colors.brand },
];

export default function FreeTrial() {
  const router = useRouter();
  const [claimed, setClaimed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Kids form modal
  const [kidsFormOpen, setKidsFormOpen] = useState(false);
  const [childName, setChildName] = useState("");
  const [childAge, setChildAge] = useState("");
  const [preferredDay, setPreferredDay] = useState<"Monday" | "Wednesday" | "">("");
  const [formErr, setFormErr] = useState<string | null>(null);
  // Adults form modal
  const [adultsFormOpen, setAdultsFormOpen] = useState(false);
  const [adultName, setAdultName] = useState("");
  const [adultClass, setAdultClass] = useState("");
  const [adultErr, setAdultErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.myTrials();
      setClaimed(r.claimed || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submitKids = async () => {
    setFormErr(null);
    if (!childName.trim()) return setFormErr("Please enter the child's name.");
    if (!childAge.trim()) return setFormErr("Please enter the child's age.");
    if (!preferredDay) return setFormErr("Please choose Monday or Wednesday.");
    setBusy("Kids");
    try {
      await api.claimTrial("Kids", { child_name: childName.trim(), child_age: childAge.trim(), preferred_day: preferredDay });
      setClaimed((c) => [...c, "Kids"]);
      setKidsFormOpen(false);
      setChildName(""); setChildAge(""); setPreferredDay("");
      setMsg(`🎉 ${childName.trim()}'s free Kids trial for ${preferredDay} is confirmed! Check your email and notifications.`);
    } catch (e: any) {
      setFormErr(e?.message || "Could not claim trial");
    } finally {
      setBusy(null);
    }
  };

  const submitAdults = async () => {
    setAdultErr(null);
    if (!adultName.trim()) return setAdultErr("Please enter your name.");
    if (!adultClass) return setAdultErr("Please choose a class and day.");
    setBusy("Adults");
    try {
      await api.claimTrial("Adults", { attendee_name: adultName.trim(), preferred_day: adultClass });
      setClaimed((c) => [...c, "Adults"]);
      setAdultsFormOpen(false);
      setAdultName(""); setAdultClass("");
      setMsg(`🎉 Your free Adults trial (${adultClass}, 6:00pm) is confirmed! Check your email and notifications.`);
    } catch (e: any) {
      setAdultErr(e?.message || "Could not claim trial");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Free Trial" backTestID="trial-back" />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <Text style={styles.hero}>Try your first class on us.</Text>
          <Text style={styles.sub}>Claim one free trial class — no payment, no commitment. Each member gets one Kids and one Adults trial.</Text>

          {TRIALS.map((t) => {
            const isClaimed = claimed.includes(t.category);
            return (
              <View key={t.category} style={styles.card}>
                <View style={[styles.icon, { backgroundColor: t.accent + "22" }]}>
                  <Ionicons name={t.icon as any} size={24} color={t.accent} />
                </View>
                <Text style={styles.cardTitle}>{t.category} Free Trial</Text>
                <Text style={styles.cardBlurb}>{t.blurb}</Text>
                {isClaimed ? (
                  <View style={styles.claimedPill}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.claimedText}>Already claimed</Text>
                  </View>
                ) : (
                  <Pressable
                    testID={`claim-trial-${t.category.toLowerCase()}`}
                    style={styles.claimBtn}
                    onPress={() => {
                      setMsg(null);
                      if (t.category === "Kids") {
                        setFormErr(null);
                        setKidsFormOpen(true);
                      } else {
                        setAdultErr(null);
                        setAdultsFormOpen(true);
                      }
                    }}
                    disabled={busy === t.category}
                  >
                    {busy === t.category ? (
                      <ActivityIndicator color={colors.onBrand} />
                    ) : (
                      <>
                        <Ionicons name={t.category === "Kids" ? "create" : "create"} size={16} color={colors.onBrand} />
                        <Text style={styles.claimText}>{t.category === "Kids" ? "CLAIM KIDS TRIAL" : "CLAIM ADULTS TRIAL"}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}

          {msg && <Text style={styles.msg}>{msg}</Text>}
          <Pressable testID="trial-view-schedule" style={styles.secondary} onPress={() => router.navigate("/(tabs)/timetable")}>
            <Text style={styles.secondaryText}>View class schedule</Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={kidsFormOpen} transparent animationType="fade" onRequestClose={() => setKidsFormOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kids Free Trial</Text>
            <Text style={styles.modalSub}>Tell us about your child so we can get them ready for their first class.</Text>

            <Text style={styles.label}>Child's name</Text>
            <TextInput
              testID="kids-child-name"
              value={childName}
              onChangeText={setChildName}
              placeholder="e.g. Sam Carman"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.input}
            />

            <Text style={styles.label}>Child's age</Text>
            <TextInput
              testID="kids-child-age"
              value={childAge}
              onChangeText={setChildAge}
              placeholder="e.g. 9"
              placeholderTextColor={colors.onSurfaceSecondary}
              keyboardType="number-pad"
              style={styles.input}
            />

            <Text style={styles.label}>Which day would you like to trial?</Text>
            <View style={styles.dayRow}>
              {(["Monday", "Wednesday"] as const).map((d) => (
                <Pressable
                  key={d}
                  testID={`kids-day-${d.toLowerCase()}`}
                  style={[styles.dayChip, preferredDay === d && styles.dayChipOn]}
                  onPress={() => setPreferredDay(d)}
                >
                  <Ionicons name="calendar-outline" size={15} color={preferredDay === d ? colors.onBrand : colors.brand} />
                  <Text style={[styles.dayText, preferredDay === d && styles.dayTextOn]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            {formErr && <Text style={styles.formErr}>{formErr}</Text>}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setKidsFormOpen(false)} disabled={busy === "Kids"}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="kids-submit"
                style={[styles.modalSubmit, busy === "Kids" && { opacity: 0.6 }]}
                onPress={submitKids}
                disabled={busy === "Kids"}
              >
                {busy === "Kids" ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>CLAIM FREE TRIAL</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={adultsFormOpen} transparent animationType="fade" onRequestClose={() => setAdultsFormOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Adults Free Trial</Text>
            <Text style={styles.modalSub}>Tell us your name and which class you'd like to try. All classes start at 6:00pm.</Text>

            <Text style={styles.label}>Your name</Text>
            <TextInput
              testID="adult-name"
              value={adultName}
              onChangeText={setAdultName}
              placeholder="e.g. Scott Carman"
              placeholderTextColor={colors.onSurfaceSecondary}
              style={styles.input}
            />

            <Text style={styles.label}>Which class would you like to try?</Text>
            <View style={{ gap: spacing.sm }}>
              {["Muay Thai - Monday", "Muay Thai - Wednesday", "Kickboxing - Tuesday", "Kickboxing - Thursday"].map((c) => (
                <Pressable
                  key={c}
                  testID={`adult-class-${c.replace(/[^a-z]/gi, "").toLowerCase()}`}
                  style={[styles.classRow, adultClass === c && styles.classRowOn]}
                  onPress={() => setAdultClass(c)}
                >
                  <Ionicons
                    name={adultClass === c ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={adultClass === c ? colors.onBrand : colors.brand}
                  />
                  <Text style={[styles.classRowText, adultClass === c && { color: colors.onBrand }]}>{c} · 6:00pm</Text>
                </Pressable>
              ))}
            </View>

            {adultErr && <Text style={styles.formErr}>{adultErr}</Text>}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setAdultsFormOpen(false)} disabled={busy === "Adults"}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="adult-submit"
                style={[styles.modalSubmit, busy === "Adults" && { opacity: 0.6 }]}
                onPress={submitAdults}
                disabled={busy === "Adults"}
              >
                {busy === "Adults" ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.modalSubmitText}>CLAIM FREE TRIAL</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading },
  hero: { ...type.h1, marginTop: spacing.sm },
  sub: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 20, fontFamily: font.display, letterSpacing: 0.3, marginTop: spacing.xs },
  cardBlurb: { color: colors.onSurfaceSecondary, fontSize: 13 },
  claimBtn: { marginTop: spacing.sm, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  claimText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5 },
  claimedPill: { marginTop: spacing.sm, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  claimedText: { color: colors.success, fontFamily: font.semibold, fontSize: 13 },
  msg: { color: colors.brand, fontFamily: font.semibold, textAlign: "center", marginTop: spacing.sm },
  secondary: { alignItems: "center", paddingVertical: spacing.md },
  secondaryText: { color: colors.onSurfaceSecondary, fontFamily: font.semibold, textDecorationLine: "underline" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.onSurface, fontSize: 22, fontFamily: font.display },
  modalSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginTop: spacing.md, marginBottom: 6 },
  input: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md, fontSize: 15 },
  dayRow: { flexDirection: "row", gap: spacing.md },
  dayChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  dayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  dayTextOn: { color: colors.onBrand },
  formErr: { color: colors.error, fontSize: 13, marginTop: spacing.md },
  classRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  classRowOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  classRowText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modalCancelText: { color: colors.onSurface, fontWeight: "800" },
  modalSubmit: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.brand },
  modalSubmitText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
