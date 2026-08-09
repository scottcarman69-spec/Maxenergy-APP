import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius } from "@/src/theme";
import { SectionTitle, Field, Checkbox, Segmented, YesNo } from "@/src/components/Form";
import { SignaturePad } from "@/src/components/SignaturePad";
import { PhotoCapture } from "@/src/components/PhotoCapture";

type Plan = { plan_id: string; name: string; category: string; price_display: string; features: string[] };

const MEDICATIONS = ["Diuretics", "Insulin", "Heparin/Warfarin", "Epilepsy medication", "Anti-depressants", "Beta blocker/ACE inhibitors"];
const CONDITIONS = ["CHD/Angina/Heart attack", "Heart murmur/Chest pains", "High blood pressure", "High cholesterol", "Thrombosis", "Stroke", "Cancer", "Epilepsy/Fainting", "Diabetes", "Asthma/Respiratory", "Osteoporosis", "Osteoarthritis", "Neck/Back/Hip/Knee pain"];

const STEPS = ["Plan", "Details", "Medical", "Waiver"];

export default function Membership() {
  const router = useRouter();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [membershipType, setMembershipType] = useState("New Membership");
  const [planId, setPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sex, setSex] = useState("Prefer not to say");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [postcode, setPostcode] = useState("");
  const [mobile, setMobile] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [consentMarketing, setConsentMarketing] = useState<boolean | null>(null);
  const [howFound, setHowFound] = useState("");
  const [category, setCategory] = useState("Adult");
  const [term, setTerm] = useState("Direct Debit");

  const [meds, setMeds] = useState<Record<string, boolean>>({});
  const [conds, setConds] = useState<Record<string, boolean>>({});
  const [smoke, setSmoke] = useState<boolean | null>(null);
  const [operations, setOperations] = useState<boolean | null>(null);
  const [pregnant, setPregnant] = useState<boolean | null>(null);
  const [regularExercise, setRegularExercise] = useState<boolean | null>(null);
  const [medNotes, setMedNotes] = useState("");

  const [mediaConsent, setMediaConsent] = useState<boolean | null>(null);
  const [waiverAgreed, setWaiverAgreed] = useState(false);
  const [signature, setSignature] = useState("");
  const [signaturePath, setSignaturePath] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.plans();
      setPlans(r.plans || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (user?.name) {
      const parts = user.name.split(" ");
      setFirstName((f) => f || parts[0] || "");
      setLastName((l) => l || parts.slice(1).join(" ") || "");
    }
  }, [user]);

  const selectedPlan = plans.find((p) => p.plan_id === planId);

  const validateStep = (s: number): string | null => {
    if (s === 0) return planId ? null : "Please choose a membership plan to continue.";
    if (s === 1) {
      if (!firstName.trim()) return "Please enter your first name.";
      if (!lastName.trim()) return "Please enter your last name.";
      if (!dob.trim()) return "Please enter your date of birth.";
      if (!mobile.trim()) return "Please enter a mobile number.";
      if (!category) return "Please select a membership category.";
      return null;
    }
    if (s === 2) return null;
    if (s === 3) {
      if (mediaConsent === null) return "Please choose Yes or No for media consent.";
      if (!waiverAgreed) return "Please tick the box to agree to the terms and waiver.";
      if (!signaturePath) return "Please sign in the signature box with your finger.";
      if (!signature.trim()) return "Please type your full name as your signature.";
      if (!photo) return "Please add a photo for your member profile / ID.";
      return null;
    }
    return null;
  };

  const goNext = () => {
    const e = validateStep(step);
    if (e) {
      setErr(e);
      return;
    }
    setErr(null);
    setStep(step + 1);
  };

  const submit = async () => {
    const e = validateStep(3);
    if (e) {
      setErr(e);
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      await api.applyMembership({
        plan_id: planId!,
        full_name: `${firstName} ${lastName}`.trim(),
        phone: mobile,
        category,
        message: howFound,
        details: {
          membership_type: membershipType,
          title,
          sex,
          dob,
          address,
          suburb,
          postcode,
          emergency_name: emergencyName,
          emergency_phone: emergencyPhone,
          consent_marketing: consentMarketing,
          how_found: howFound,
          term,
          medical: {
            medications: meds,
            conditions: conds,
            smoke,
            operations,
            pregnant,
            regular_exercise: regularExercise,
            notes: medNotes,
          },
          media_consent: mediaConsent,
          waiver_agreed: waiverAgreed,
          signature,
          signature_path: signaturePath,
          photo_base64: photo,
          submitted_date: new Date().toISOString().slice(0, 10),
        },
      });
      setDone(true);
    } catch (e: any) {
      setErr(e?.message || "Could not submit application");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={72} color={colors.brand} />
          <Text style={styles.doneTitle}>Application submitted!</Text>
          <Text style={styles.doneSub}>
            Thanks {firstName}. The Max Energy team will review your application and be in touch. A confirmation email is on its way.
          </Text>
          <Pressable testID="membership-done-btn" style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/home")}>
            <Text style={styles.primaryBtnText}>BACK TO HOME</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="membership-back" onPress={() => (step === 0 ? router.back() : setStep(step - 1))} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Membership Form</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* progress */}
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.progressItem}>
            <View style={[styles.progressDot, i <= step && styles.progressDotOn]}>
              <Text style={[styles.progressNum, i <= step && { color: colors.onBrand }]}>{i + 1}</Text>
            </View>
            <Text style={[styles.progressLabel, i === step && { color: colors.brand }]}>{s}</Text>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {step === 0 && (
              <>
                <SectionTitle>MEMBERSHIP TYPE</SectionTitle>
                <Segmented options={["New Membership", "Renewing Membership"]} value={membershipType} onChange={setMembershipType} testIDPrefix="mtype" />
                <SectionTitle>CHOOSE A PLAN</SectionTitle>
                <View style={{ gap: spacing.md }}>
                  {plans.map((p) => {
                    const active = p.plan_id === planId;
                    return (
                      <Pressable
                        key={p.plan_id}
                        testID={`plan-${p.plan_id}`}
                        style={[styles.planCard, active && styles.planCardOn]}
                        onPress={() => setPlanId(p.plan_id)}
                      >
                        <View style={styles.planTop}>
                          <View>
                            <Text style={styles.planName}>{p.name}</Text>
                            <View style={styles.planCatTag}>
                              <Text style={styles.planCatText}>{p.category}</Text>
                            </View>
                          </View>
                          <Text style={styles.planPrice}>${p.price_display}</Text>
                        </View>
                        {p.features?.map((f) => (
                          <View key={f} style={styles.featRow}>
                            <Ionicons name="checkmark" size={14} color={colors.brand} />
                            <Text style={styles.featText}>{f}</Text>
                          </View>
                        ))}
                        {active && (
                          <View style={styles.selectedTag}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
                            <Text style={styles.selectedText}>Selected</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {step === 1 && (
              <>
                <SectionTitle>MEMBER DETAILS</SectionTitle>
                <Field label="Title" testID="m-title" value={title} onChangeText={setTitle} placeholder="Mr / Mrs / Ms" />
                <Text style={styles.miniLabel}>Sex</Text>
                <Segmented options={["Male", "Female", "Prefer not to say"]} value={sex} onChange={setSex} testIDPrefix="sex" />
                <View style={{ height: spacing.md }} />
                <Field label="First name *" testID="m-first" value={firstName} onChangeText={setFirstName} placeholder="First name" />
                <Field label="Last name *" testID="m-last" value={lastName} onChangeText={setLastName} placeholder="Last name" />
                <Field label="Date of birth *" testID="m-dob" value={dob} onChangeText={setDob} placeholder="DD/MM/YYYY" />
                <Field label="Home address" testID="m-address" value={address} onChangeText={setAddress} placeholder="Street address" />
                <Field label="Suburb" testID="m-suburb" value={suburb} onChangeText={setSuburb} placeholder="Suburb" />
                <Field label="Postcode" testID="m-postcode" value={postcode} onChangeText={setPostcode} keyboardType="number-pad" placeholder="Postcode" />
                <Field label="Mobile *" testID="m-mobile" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="Mobile number" />
                <Field label="Emergency contact name" testID="m-emg-name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Contact name" />
                <Field label="Emergency contact phone" testID="m-emg-phone" value={emergencyPhone} onChangeText={setEmergencyPhone} keyboardType="phone-pad" placeholder="Contact phone" />
                <YesNo label="Consent to receive info via email/post?" value={consentMarketing} onChange={setConsentMarketing} testID="m-consent" />
                <Field label="How did you find out about us?" testID="m-found" value={howFound} onChangeText={setHowFound} placeholder="e.g. Instagram, friend, walk-in" />

                <SectionTitle>MEMBERSHIP DETAILS</SectionTitle>
                <Text style={styles.miniLabel}>Category</Text>
                <Segmented options={["Adult", "Student", "Senior", "Child 4-16", "Other"]} value={category} onChange={setCategory} testIDPrefix="category" />
                <View style={{ height: spacing.md }} />
                <Text style={styles.miniLabel}>Term</Text>
                <Segmented
                  options={["Direct Debit", "Upfront", "1 Month", "3 Month", "6 Month", "12 Month", "10 Visit Pass"]}
                  value={term}
                  onChange={setTerm}
                  testIDPrefix="term"
                />
              </>
            )}

            {step === 2 && (
              <>
                <SectionTitle>MEDICAL — MEDICATIONS</SectionTitle>
                <Text style={styles.helpText}>Tick any medication you are currently taking.</Text>
                {MEDICATIONS.map((m) => (
                  <Checkbox key={m} testID={`med-${m}`} label={m} value={!!meds[m]} onToggle={() => setMeds((s) => ({ ...s, [m]: !s[m] }))} />
                ))}

                <SectionTitle>MEDICAL — CONDITIONS</SectionTitle>
                <Text style={styles.helpText}>Tick any condition you have suffered from.</Text>
                {CONDITIONS.map((c) => (
                  <Checkbox key={c} testID={`cond-${c}`} label={c} value={!!conds[c]} onToggle={() => setConds((s) => ({ ...s, [c]: !s[c] }))} />
                ))}

                <SectionTitle>GENERAL HEALTH</SectionTitle>
                <YesNo label="Do you smoke?" value={smoke} onChange={setSmoke} testID="q-smoke" />
                <YesNo label="Any major operations or fractures?" value={operations} onChange={setOperations} testID="q-ops" />
                <YesNo label="Pregnant / had a baby in last 6 months?" value={pregnant} onChange={setPregnant} testID="q-preg" />
                <YesNo label="Do you currently exercise regularly?" value={regularExercise} onChange={setRegularExercise} testID="q-ex" />
                <View style={{ height: spacing.md }} />
                <Field
                  label="Any other conditions we should know? (optional)"
                  testID="med-notes"
                  value={medNotes}
                  onChangeText={setMedNotes}
                  placeholder="Details..."
                  multiline
                  style={{ minHeight: 80, textAlignVertical: "top", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, borderRadius: radius.md, padding: spacing.lg }}
                />
              </>
            )}

            {step === 3 && (
              <>
                <SectionTitle>MEDIA CONSENT</SectionTitle>
                <Text style={styles.helpText}>
                  Photos/videos may be taken during classes and events for promotional and educational use.
                </Text>
                <YesNo label="I consent to media being recorded" value={mediaConsent} onChange={setMediaConsent} testID="media-consent" />

                <SectionTitle>ACTIVITY WAIVER & TERMS</SectionTitle>
                <View style={styles.waiverBox}>
                  <Text style={styles.waiverText}>
                    I acknowledge that the activity (Boxing, Muay Thai, Kickboxing) is a dangerous activity and that by
                    participating I am exposed to certain risks including injury or death. I participate at my sole risk
                    and release, indemnify and hold harmless Max Energy Fitness, its owners, directors, officers,
                    employees and agents from all claims arising out of injury, loss, damage or death, whether by
                    negligence or otherwise. I confirm I have no physical limitations or medical conditions (beyond those
                    declared) that would prevent me from participating safely. I have read and agree to the full
                    membership terms & conditions, including cooling-off, direct debit and cancellation policies.
                  </Text>
                </View>
                <Checkbox
                  testID="waiver-agree"
                  label="I have read, understood and agree to the terms, conditions and waiver above."
                  value={waiverAgreed}
                  onToggle={() => setWaiverAgreed((v) => !v)}
                />

                <SectionTitle>SIGNATURE</SectionTitle>
                <Text style={styles.helpText}>Draw your signature below with your finger to confirm your declaration.</Text>
                <SignaturePad
                  testID="signature-pad"
                  onChange={setSignaturePath}
                  onDrawStart={() => setScrollEnabled(false)}
                  onDrawEnd={() => setScrollEnabled(true)}
                />
                <View style={{ height: spacing.sm }} />
                <Field label="Full name (as signed)" testID="waiver-signature" value={signature} onChangeText={setSignature} placeholder="Your full name" />

                <SectionTitle>PHOTO (REQUIRED)</SectionTitle>
                <Text style={styles.helpText}>Add a photo for your member profile / ID.</Text>
                <PhotoCapture testID="member-photo" value={photo} onChange={setPhoto} />

                <Text style={[styles.helpText, { marginTop: spacing.md }]}>Date: {new Date().toLocaleDateString()}</Text>

                {selectedPlan && (
                  <View style={styles.summary}>
                    <Text style={styles.summaryTitle}>SUMMARY</Text>
                    <Text style={styles.summaryRow}>Plan: {selectedPlan.name} (${selectedPlan.price_display})</Text>
                    <Text style={styles.summaryRow}>Category: {category} · Term: {term}</Text>
                    <Text style={styles.summaryRow}>Applicant: {firstName} {lastName}</Text>
                  </View>
                )}
              </>
            )}

            {err && <Text style={styles.error}>{err}</Text>}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        {step < STEPS.length - 1 ? (
          <Pressable
            testID="membership-next"
            style={styles.primaryBtn}
            onPress={goNext}
          >
            <Text style={styles.primaryBtnText}>CONTINUE</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.onBrand} />
          </Pressable>
        ) : (
          <Pressable
            testID="membership-submit"
            style={[styles.primaryBtn, submitting && styles.btnDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryBtnText}>SUBMIT APPLICATION</Text>}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  progressRow: { flexDirection: "row", justifyContent: "space-around", paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  progressItem: { alignItems: "center", gap: 4 },
  progressDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  progressDotOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  progressNum: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 12 },
  progressLabel: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700" },
  miniLabel: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  helpText: { color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: spacing.sm },
  planCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, gap: 6 },
  planCardOn: { borderColor: colors.brand, borderWidth: 2 },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  planName: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  planCatTag: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, marginTop: 4 },
  planCatText: { color: colors.brand, fontSize: 10, fontWeight: "800" },
  planPrice: { color: colors.brand, fontSize: 18, fontWeight: "900" },
  featRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  featText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  selectedTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  selectedText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  waiverBox: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  waiverText: { color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 18 },
  summary: { marginTop: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg },
  summaryTitle: { color: colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  summaryRow: { color: colors.onSurface, fontSize: 13, marginTop: 2 },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.md },
  footer: { padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? 28 : spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  primaryBtnText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  btnDisabled: { opacity: 0.4 },
  doneWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  doneTitle: { color: colors.onSurface, fontSize: 24, fontWeight: "900", marginTop: spacing.md },
  doneSub: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
