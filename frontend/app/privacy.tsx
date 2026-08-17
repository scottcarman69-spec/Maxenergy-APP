import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

const UPDATED = "17 August 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sub}>{children}</Text>;
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
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Privacy Policy" backTestID="privacy-back" fallback="/(tabs)/profile" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: {UPDATED}</Text>

        <P>
          Maxenergy Fitness (ABN 81 213 163 833) ("we", "us" or "our") operates the Maxenergy Fitness mobile
          application and associated services.
        </P>
        <P>
          We respect your privacy and are committed to protecting the personal information we collect and handle.
          This Privacy Policy explains what information we collect, how we use and protect it, when it may be shared,
          and the choices available to you.
        </P>

        <Section title="1. Information We Collect">
          <P>Depending on how you use our app and services, we may collect:</P>
          <Sub>Account information</Sub>
          <Bullet>Name</Bullet>
          <Bullet>Email address</Bullet>
          <Bullet>Login and account information</Bullet>
          <Bullet>Other information you provide when creating or managing your account</Bullet>
          <P>Passwords are securely protected using appropriate security measures. We do not store passwords in plain text.</P>
          <Sub>Profile, booking and attendance information</Sub>
          <Bullet>Classes you book</Bullet>
          <Bullet>Booking history</Bullet>
          <Bullet>Attendance and check-in records</Bullet>
          <Bullet>QR code check-ins</Bullet>
          <Bullet>Membership-related information</Bullet>
          <Bullet>Messages or enquiries you send to us</Bullet>
          <Sub>Payment information</Sub>
          <P>Payments made through the app are processed securely by our payment provider, Square.</P>
          <P>
            We do not store your full credit or debit card details on our servers. Payment information is handled by
            Square in accordance with its own security and privacy requirements.
          </P>
          <Sub>Membership information</Sub>
          <P>Membership registrations and direct debit arrangements may be completed through Vigyr's secure systems.</P>
          <P>
            Information entered through Vigyr is handled by Vigyr and relevant payment or billing providers in
            accordance with their applicable privacy and security practices.
          </P>
          <Sub>Images and uploaded content</Sub>
          <P>If the app allows you to upload an image or other content, we collect the information you choose to provide.</P>
          <Sub>Device permissions</Sub>
          <P>Certain features may request access to functions on your device.</P>
          <P>
            For example, authorised staff may use camera access to scan member QR codes for attendance and class
            check-ins.
          </P>
          <P>We only request device permissions that are required for the relevant app feature.</P>
        </Section>

        <Section title="2. How We Collect Information">
          <P>We may collect personal information:</P>
          <Bullet>Directly from you when you create an account, make a booking, contact us or use the app</Bullet>
          <Bullet>When you attend or check in to a class</Bullet>
          <Bullet>When you purchase a class, service or membership</Bullet>
          <Bullet>Through service providers used to operate the app and our gym services</Bullet>
          <Bullet>When you choose to sign in using a supported third-party login service</Bullet>
        </Section>

        <Section title="3. How We Use Your Information">
          <P>We may use your information to:</P>
          <Bullet>Create and manage your account</Bullet>
          <Bullet>Manage class bookings and cancellations</Bullet>
          <Bullet>Confirm attendance and check-ins</Bullet>
          <Bullet>Process payments</Bullet>
          <Bullet>Manage memberships</Bullet>
          <Bullet>Provide gym and membership services</Bullet>
          <Bullet>Send booking confirmations and class reminders</Bullet>
          <Bullet>Send important service, membership or account notices</Bullet>
          <Bullet>Respond to enquiries and provide customer support</Bullet>
          <Bullet>Maintain the security and operation of the app</Bullet>
          <Bullet>Improve our classes, services and app functionality</Bullet>
          <Bullet>Meet legal and regulatory requirements</Bullet>
          <P>Where available, class reminder preferences can be managed within the app.</P>
        </Section>

        <Section title="4. Sharing Your Information">
          <P>We do not sell your personal information.</P>
          <P>
            We may share information with trusted service providers where necessary to operate our app and provide our
            services, including:
          </P>
          <Bullet>Square — payment processing.</Bullet>
          <Bullet>Vigyr — membership registration and gym membership/access management.</Bullet>
          <Bullet>Resend — transactional emails, including booking confirmations and class notifications.</Bullet>
          <Bullet>Google — where you choose to use Sign in with Google or other supported Google services.</Bullet>
          <P>
            We may also use technology, hosting, database, notification and other service providers necessary to
            operate and secure the app.
          </P>
          <P>These providers may only receive information reasonably required to provide their services.</P>
          <P>
            We may also disclose information where required or authorised by Australian law, or where reasonably
            necessary to protect our legal rights or the safety of our members, staff or others.
          </P>
        </Section>

        <Section title="5. Overseas Processing and Disclosure">
          <P>
            Some of the technology and service providers used by our app may operate systems or infrastructure outside
            Australia.
          </P>
          <P>
            As a result, personal information may in some circumstances be processed, stored or disclosed outside
            Australia.
          </P>
          <P>
            Where required, we take reasonable steps to ensure personal information disclosed to overseas recipients is
            handled appropriately and in accordance with applicable Australian privacy requirements.
          </P>
          <P>
            Where it is practicable to identify the countries in which overseas recipients are located, we will provide
            that information in this Privacy Policy or otherwise make it available to you.
          </P>
        </Section>

        <Section title="6. Data Storage and Security">
          <P>
            We take reasonable steps to protect personal information from misuse, interference, loss, unauthorised
            access, modification and disclosure.
          </P>
          <P>Access to personal information is restricted to authorised persons who require access for legitimate business purposes.</P>
          <P>Payment card information is handled by our payment provider and is not stored directly by Maxenergy Fitness.</P>
          <P>
            Although we take reasonable security precautions, no internet-connected system or method of electronic
            transmission can be guaranteed to be completely secure.
          </P>
        </Section>

        <Section title="7. Data Retention and Account Deletion">
          <P>
            We retain personal information for as long as reasonably necessary to provide our services, operate the app,
            maintain appropriate business records and meet legal or regulatory requirements.
          </P>
          <P>You may request deletion of your account and associated personal information.</P>
          <P>
            Some information may need to be retained after an account is deleted where required by law, for legitimate
            record-keeping purposes, to resolve disputes or to protect our legal rights.
          </P>
        </Section>

        <Section title="8. Accessing and Correcting Your Information">
          <P>
            You may request access to personal information we hold about you or ask us to correct information that is
            inaccurate, incomplete or out of date.
          </P>
          <P>You can also update certain account information directly through the app where this functionality is available.</P>
          <P>To make an access, correction or deletion request, contact us using the details below.</P>
        </Section>

        <Section title="9. Children's Privacy">
          <P>Our services include classes for children and young people.</P>
          <P>
            Where appropriate, a parent or legal guardian must provide consent and manage or authorise the account for a
            member under 18.
          </P>
          <P>
            We aim to collect only the personal information reasonably necessary to manage bookings, attendance,
            memberships, safety and participation in our services.
          </P>
          <P>Parents or guardians may contact us regarding personal information associated with their child's account.</P>
        </Section>

        <Section title="10. Privacy Complaints">
          <P>If you believe we have not handled your personal information appropriately, please contact us using the details below.</P>
          <P>Please provide enough information for us to understand and investigate your concern.</P>
          <P>We will review your complaint and aim to respond within a reasonable period.</P>
          <P>
            If you are not satisfied with our response and the Australian Privacy Act applies to the matter, you may be
            entitled to make a complaint to the Office of the Australian Information Commissioner (OAIC).
          </P>
        </Section>

        <Section title="11. Third-Party Services">
          <P>Our app may contain links to, or integrate with, third-party services.</P>
          <P>
            Those services may have their own privacy policies and terms. We encourage you to review the privacy
            information provided by those services before providing personal information directly to them.
          </P>
        </Section>

        <Section title="12. Changes to This Privacy Policy">
          <P>We may update this Privacy Policy from time to time to reflect changes to our app, services, providers or legal requirements.</P>
          <P>The latest version will be made available through the app and/or our website.</P>
          <P>The "Last updated" date at the top of this policy will show when the policy was most recently revised.</P>
        </Section>

        <Section title="13. Contact Us">
          <P>
            If you have questions, would like to access or correct your personal information, request account deletion,
            or make a privacy complaint, please contact:
          </P>
          <Text style={styles.contactName}>Maxenergy Fitness</Text>
          <Text style={styles.contactLine}>ABN 81 213 163 833</Text>
          <Text style={styles.contactLine}>Shop 38, Campus Village Shopping Centre</Text>
          <Text style={styles.contactLine}>38 Faculty Close</Text>
          <Text style={styles.contactLine}>Smithfield QLD 4878</Text>
          <Text style={styles.contactLine}>Australia</Text>
          <Pressable onPress={() => Linking.openURL("mailto:info@maxenergy.com.au")}>
            <Text style={styles.link}>Email: info@maxenergy.com.au</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL("tel:0740579005")}>
            <Text style={styles.link}>Phone: 07 4057 9005</Text>
          </Pressable>
        </Section>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg },
  title: { color: colors.onSurface, fontSize: 26, fontFamily: font.display },
  updated: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  section: { marginTop: spacing.lg },
  h2: { color: colors.onSurface, fontSize: 17, fontWeight: "800", marginBottom: spacing.sm },
  sub: { color: colors.onSurface, fontSize: 14, fontWeight: "800", marginTop: spacing.sm, marginBottom: 4 },
  p: { color: colors.onSurface, fontSize: 14, lineHeight: 22, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  bulletText: { color: colors.onSurface, fontSize: 14, lineHeight: 21, flex: 1 },
  contactName: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 4 },
  contactLine: { color: colors.onSurface, fontSize: 14, lineHeight: 21 },
  link: { color: colors.brand, fontSize: 14, fontWeight: "700", marginTop: 6 },
});
