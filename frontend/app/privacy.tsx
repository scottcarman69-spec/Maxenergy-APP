import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

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
      <ScreenHeader title="Privacy Policy" backTestID="privacy-back" fallback="/(tabs)/profile" />

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

        <Section title="4. How we store & protect your data">
          <P>
            We take the security of your information seriously. Here is how your data is stored and protected:
          </P>
          <Bullet>
            <Text style={styles.bold}>Passwords:</Text> Your password is never stored in a readable form. It is
            protected using bcrypt one-way hashing with a unique salt, so it cannot be reversed back into your
            original password — not even by us.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Your information:</Text> Member accounts, bookings, attendance records and
            related details are stored in a secure database, with access restricted to authorised staff.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Uploaded images:</Text> Any photos you upload (such as with a membership
            application) are kept in secure managed cloud storage, separate from the main database.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>Payments:</Text> Card payments are processed securely by Square. We do not
            store your full card details.
          </Bullet>
          <Bullet>
            <Text style={styles.bold}>In transit:</Text> Information is sent between the app and our servers over
            an encrypted (HTTPS) connection.
          </Bullet>
          <P>
            {/* TODO: Confirm the following details with your hosting provider before publishing. */}
            Our app and database are hosted with [HOSTING PROVIDER], with data stored in [DATA REGION / COUNTRY].
            [State here whether any information is stored or processed outside Australia.] Regular backups are
            maintained in [BACKUP LOCATION]. For details of our hosting and data-processing arrangements, contact
            us using the details below.
          </P>
          <P>
            While we take reasonable steps to protect your data, no method of transmission or storage over the
            internet is completely secure.
          </P>
        </Section>

        <Section title="5. Your rights">
          <Bullet>Access or update your personal information.</Bullet>
          <Bullet>Request deletion of your account and associated data (Profile → Settings → Password &amp; account).</Bullet>
          <Bullet>Opt out of class reminders and notifications at any time in the app.</Bullet>
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
  bold: { fontWeight: "800", color: colors.onSurface },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  contactText: { color: colors.onSurface, fontSize: 14, fontWeight: "600", flex: 1 },
  footer: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.xl },
});
