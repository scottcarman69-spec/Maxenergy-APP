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
  Modal,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius } from "@/src/theme";
import { SectionTitle, Field, Checkbox, Segmented, YesNo } from "@/src/components/Form";
import { SignaturePad } from "@/src/components/SignaturePad";
import { PhotoCapture } from "@/src/components/PhotoCapture";
import { MEMBERSHIP_TERMS, TERMS_DECLARATION, TERMS_VERSION } from "@/src/membershipTerms";

type Plan = { plan_id: string; name: string; category: string; price_display: string; features: string[] };

const MEDICATIONS = ["Diuretics", "Insulin", "Heparin/Warfarin", "Epilepsy medication", "Anti-depressants", "Beta blocker/ACE inhibitors"];
const CONDITIONS = ["CHD/Angina/Heart attack", "Heart murmur/Chest pains", "High blood pressure", "High cholesterol", "Thrombosis", "Stroke", "Cancer", "Epilepsy/Fainting", "Diabetes", "Asthma/Respiratory", "Osteoporosis", "Osteoarthritis", "Neck/Back/Hip/Knee pain"];

const STEPS = ["Plan", "Details", "Medical", "Waiver"];

export default function Membership() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // form state
  const [membershipType, setMembershipType] = useState("New Membership");
  const [planId, setPlanId] = useState<string | null>("new_membership_form");
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
  const [term, setTerm] = useState("Upfront");

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
  const [termsVisible, setTermsVisible] = useState(false);

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
      if (!waiverAgreed) return "Please tick the box to agree to the Membership Terms & Conditions.";
      if (!signaturePath) return "Please sign in the signature box with your finger or mouse.";
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
          terms_accepted: waiverAgreed,
          terms_version: TERMS_VERSION,
          terms_accepted_at: waiverAgreed ? new Date().toISOString() : null,
          signature,
          signature_path: signaturePath,
          photo_base64: photo,
          submitted_date: new Date().toISOString().slice(0, 10),
        },
      });
      setDone(true);
      refresh();
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
          <Text style={styles.doneTitle}>Form submitted!</Text>
          <Text style={styles.doneSub}>
            Thanks {firstName}. Your membership form has been sent to the Maxenergy team and is now on file.
            {next === "store" ? " You can now continue to your purchase." : " A confirmation email is on its way."}
          </Text>
          {next === "store" ? (
            <Pressable testID="membership-done-btn" style={styles.primaryBtn} onPress={() => router.replace("/memberships")}>
              <Text style={styles.primaryBtnText}>CONTINUE TO PURCHASE</Text>
            </Pressable>
          ) : (
            <Pressable testID="membership-done-btn" style={styles.primaryBtn} onPress={() => router.replace("/(tabs)/home")}>
              <Text style={styles.primaryBtnText}>BACK TO HOME</Text>
            </Pressable>
          )}
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
                <SectionTitle>MEMBERSHIP FORM</SectionTitle>
                <View style={{ gap: spacing.md }}>
                  <View style={[styles.planCard, styles.planCardOn]}>
                    <View style={styles.planTop}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flex: 1 }}>
                        <View style={styles.formIcon}>
                          <Ionicons name="document-text" size={22} color={colors.brand} />
                        </View>
                        <Text style={styles.planName}>New Membership Form</Text>
                      </View>
                    </View>
                    {[
                      "Complete your details & emergency contact",
                      "Health & medical questionnaire",
                      "Sign the waiver and add your photo",
                      "Our team will confirm your membership",
                    ].map((f) => (
                      <View key={f} style={styles.featRow}>
                        <Ionicons name="checkmark" size={14} color={colors.brand} />
                        <Text style={styles.featText}>{f}</Text>
                      </View>
                    ))}
                  </View>
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
                <Text style={styles.miniLabel}>Membership option</Text>
                <Segmented
                  options={["Upfront", "Class"]}
                  value={term}
                  onChange={setTerm}
                  testIDPrefix="term"
                />
                <View style={styles.ddNotice}>
                  <Ionicons name="information-circle" size={18} color={colors.brand} />
                  <Text style={styles.ddNoticeText}>
                    Direct debit memberships must be set up via the Vigyr sign-on link (not through this form).
                  </Text>
                </View>
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

                <SectionTitle>MEMBERSHIP TERMS & CONDITIONS</SectionTitle>
                <Text style={styles.helpText}>
                  Please read the full Maxenergy Fitness Policies & Terms Agreement. You must agree before submitting.
                </Text>
                <View style={styles.termsPreview}>
                  <Text style={styles.termsPreviewText} numberOfLines={4}>
                    {MEMBERSHIP_TERMS[0].body}
                  </Text>
                  <Pressable testID="view-terms" style={styles.readMoreBtn} onPress={() => setTermsVisible(true)}>
                    <Ionicons name="document-text-outline" size={16} color={colors.brand} />
                    <Text style={styles.readMoreText}>Read the full Terms & Conditions</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.brand} />
                  </Pressable>
                </View>
                <Checkbox
                  testID="waiver-agree"
                  label="I have read, understood and agree to the Maxenergy Fitness Membership Terms & Conditions, including the risk acknowledgment, release & indemnity, media consent, cooling-off, direct debit and cancellation policies."
                  value={waiverAgreed}
                  onToggle={() => setWaiverAgreed((v) => !v)}
                />
                {!waiverAgreed && (
                  <Text style={styles.mandatoryNote}>* Agreement to the Terms & Conditions is required.</Text>
                )}

                <SectionTitle>SIGNATURE</SectionTitle>
                <Text style={styles.helpText}>Draw your signature below with your finger or mouse to confirm your declaration.</Text>
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

                <Text style={[styles.helpText, { marginTop: spacing.md }]}>Date: {new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}</Text>

                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>SUMMARY</Text>
                  <Text style={styles.summaryRow}>Form: New Membership Form</Text>
                  <Text style={styles.summaryRow}>Category: {category} · Term: {term}</Text>
                  <Text style={styles.summaryRow}>Applicant: {firstName} {lastName}</Text>
                </View>
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

      <Modal visible={termsVisible} animationType="slide" onRequestClose={() => setTermsVisible(false)}>
        <SafeAreaView style={styles.root} edges={["top"]}>
          <View style={styles.header}>
            <Pressable testID="terms-close" onPress={() => setTermsVisible(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </Pressable>
            <Text style={styles.headerTitle}>Terms & Conditions</Text>
            <View style={{ width: 26 }} />
          </View>
          <ScrollView
            testID="terms-scroll"
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          >
            <Text style={styles.termsDocTitle}>Maxenergy Fitness</Text>
            <Text style={styles.termsDocSub}>Membership Policies & Terms Agreement</Text>
            {MEMBERSHIP_TERMS.map((sec) => (
              <View key={sec.title} style={{ marginTop: spacing.lg }}>
                <Text style={styles.termsHeading}>{sec.title}</Text>
                <Text style={styles.termsBody}>{sec.body}</Text>
              </View>
            ))}
            <View style={styles.declareBox}>
              <Text style={styles.declareText}>{TERMS_DECLARATION}</Text>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              testID="terms-agree-btn"
              style={styles.primaryBtn}
              onPress={() => {
                setWaiverAgreed(true);
                setTermsVisible(false);
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.onBrand} />
              <Text style={styles.primaryBtnText}>I AGREE TO THESE TERMS</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
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
  ddNotice: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  ddNoticeText: { color: colors.onSurface, fontSize: 12.5, lineHeight: 18, flex: 1 },
  planCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, gap: 6 },
  formIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
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
  termsPreview: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md },
  termsPreviewText: { color: colors.onSurfaceSecondary, fontSize: 12.5, lineHeight: 18 },
  readMoreBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  readMoreText: { color: colors.brand, fontWeight: "800", fontSize: 12.5 },
  mandatoryNote: { color: colors.warning, fontSize: 11.5, marginTop: 4, marginLeft: 2 },
  termsDocTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "900", textAlign: "center" },
  termsDocSub: { color: colors.brand, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.5, textAlign: "center", marginTop: 2, textTransform: "uppercase" },
  termsHeading: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginBottom: 6 },
  termsBody: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 20 },
  declareBox: { marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand },
  declareText: { color: colors.onSurface, fontSize: 13, lineHeight: 20, fontStyle: "italic" },
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
