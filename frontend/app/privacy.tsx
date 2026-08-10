import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

const GYM = {
  name: "Maxenergy Fitness",
  abn: "81 213 163 833",
  email: "info@maxenergy.com.au",
  phone: "07 4057 9005",
  address: "Shop 38 Campus Village Shopping Centre, 38 Faculty Cl, Smithfield QLD 4878",
};

const UPDATED = "June 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}
function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.dot} />
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicy() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="privacy-back" hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: {UPDATED}</Text>

        <P>
          {GYM.name} (ABN {GYM.abn}) ("we", "us", "our") operates this mobile application. We respect your
          privacy and are committed to protecting your personal information in line with the Australian Privacy
          Principles under the Privacy Act 1988 (Cth). This policy explains what we collect, why, and how we handle it.
        </P>

        <Section title="1. Information we collect">
          <Bullet>Account details: your name, email address and password (stored encrypted).</Bullet>
          <Bullet>Profile & booking data: classes you book, attendance/check-ins, and messages you send us.</Bullet>
          <Bullet>Payment information: processed securely by our payment provider (Square). We do not store your full card or bank details on our servers.</Bullet>
          <Bullet>Membership sign-up: completed on our provider Vigyr's secure portal; that information is handled under Vigyr's terms.</Bullet>
          <Bullet>Device permissions: camera access (staff only) is used to scan class check-in QR codes; images you choose to upload.</Bullet>
        </Section>

        <Section title="2. How we use your information">
          <Bullet>To create and manage your account and class bookings.</Bullet>
          <Bullet>To process payments for classes and memberships.</Bullet>
          <Bullet>To send booking confirmations, class reminders and important notices (you can turn class reminders off in the app).</Bullet>
          <Bullet>To record attendance and improve our classes and services.</Bullet>
        </Section>

        <Section title="3. Sharing your information">
          <P>We do not sell your personal information. We share it only with trusted service providers who help us run the app:</P>
          <Bullet>Square — payment processing.</Bullet>
          <Bullet>Vigyr — membership sign-up and gym access management.</Bullet>
          <Bullet>Resend — sending you transactional emails.</Bullet>
          <Bullet>Google — optional "Sign in with Google" login.</Bullet>
          <P>We may also disclose information where required by law.</P>
        </Section>

        <Section title="4. Data storage & security">
          <P>
            Your information is stored securely and access is restricted to authorised staff. Passwords are encrypted
            and payment card details are handled by Square, not stored by us. While we take reasonable steps to protect
            your data, no method of transmission over the internet is completely secure.
          </P>
        </Section>

        <Section title="5. Your rights">
          <Bullet>Access or update your personal information.</Bullet>
          <Bullet>Request deletion of your account and associated data.</Bullet>
          <Bullet>Opt out of class reminders at any time in the app.</Bullet>
          <P>To make a request, contact us using the details below.</P>
        </Section>

        <Section title="6. Children's privacy">
          <P>
            For members under 18 (including our kids' classes), a parent or guardian provides consent and manages the
            account. We only collect information necessary to deliver classes safely.
          </P>
        </Section>

        <Section title="7. Changes to this policy">
          <P>We may update this policy from time to time. The latest version will always be available here in the app.</P>
        </Section>

        <Section title="8. Contact us">
          <P>If you have any questions about this policy or your personal information, contact us:</P>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${GYM.email}`)}>
            <Ionicons name="mail-outline" size={18} color={colors.brand} />
            <Text style={styles.contactText}>{GYM.email}</Text>
          </Pressable>
          <Pressable style={styles.contactRow} onPress={() => Linking.openURL(`tel:${GYM.phone.replace(/\s/g, "")}`)}>
            <Ionicons name="call-outline" size={18} color={colors.brand} />
            <Text style={styles.contactText}>{GYM.phone}</Text>
          </Pressable>
          <View style={styles.contactRow}>
            <Ionicons name="location-outline" size={18} color={colors.brand} />
            <Text style={styles.contactText}>{GYM.address}</Text>
          </View>
        </Section>

        <Text style={styles.footer}>{GYM.name} · ABN {GYM.abn}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  scroll: { padding: spacing.xl, paddingBottom: 48 },
  title: { color: colors.onSurface, fontSize: 26, fontFamily: font.display },
  updated: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 4, marginBottom: spacing.lg },
  section: { marginTop: spacing.lg },
  h2: { color: colors.brand, fontSize: 15, fontWeight: "800", marginBottom: spacing.sm },
  p: { color: colors.onSurface, fontSize: 14, lineHeight: 22, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", gap: 10, marginBottom: 8, paddingRight: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  bulletText: { color: colors.onSurface, fontSize: 14, lineHeight: 21, flex: 1 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  contactText: { color: colors.onSurface, fontSize: 14, fontWeight: "600", flex: 1 },
  footer: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.xl },
});
