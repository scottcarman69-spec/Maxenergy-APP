import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

type Step = { icon: keyof typeof Ionicons.glyphMap; title: string; text: string };

const STEPS: Step[] = [
  { icon: "calendar", title: "Find your class", text: "Browse the full timetable and tap any class to see details, trainer and times." },
  { icon: "qr-code", title: "Book & check in", text: "Reserve your spot, then scan your QR code at the gym. Manage it all in My Bookings." },
  { icon: "card", title: "Passes & wallet", text: "Buy class passes or a membership and track your credits in your wallet — all in the app." },
];

export default function WelcomeTour({
  visible,
  onDone,
  onFinish,
}: {
  visible: boolean;
  onDone: () => void;
  onFinish: () => void;
}) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const close = () => {
    setI(0);
    onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable testID="tour-skip" onPress={close} hitSlop={12} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={34} color={colors.brand} />
          </View>

          <Text style={styles.stepLabel}>STEP {i + 1} OF {STEPS.length}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.text}>{step.text}</Text>

          <View style={styles.dots}>
            {STEPS.map((_, idx) => (
              <View key={idx} style={[styles.dot, idx === i && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.btnRow}>
            {i > 0 ? (
              <Pressable testID="tour-back" onPress={() => setI(i - 1)} style={styles.ghostBtn}>
                <Text style={styles.ghostText}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.ghostBtn} />
            )}

            <Pressable
              testID={last ? "tour-finish" : "tour-next"}
              onPress={() => {
                if (last) {
                  close();
                  onFinish();
                } else {
                  setI(i + 1);
                }
              }}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.primaryText}>{last ? "Get started" : "Next"}</Text>
              <Ionicons name={last ? "rocket" : "arrow-forward"} size={16} color={colors.onBrand} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, alignItems: "center" },
  skip: { position: "absolute", top: 12, right: 14, padding: 6, zIndex: 2 },
  skipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "700" },
  iconWrap: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
  stepLabel: { color: colors.brand, fontSize: 11, fontFamily: font.heading, letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: 22, fontFamily: font.display, marginTop: 6, textAlign: "center" },
  text: { color: colors.onSurfaceSecondary, fontSize: 14.5, lineHeight: 21, textAlign: "center", marginTop: spacing.sm },
  dots: { flexDirection: "row", gap: 7, marginTop: spacing.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.surfaceTertiary },
  dotActive: { width: 20, backgroundColor: colors.brand },
  btnRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", marginTop: spacing.xl },
  ghostBtn: { minWidth: 70, paddingVertical: 12, paddingHorizontal: spacing.md },
  ghostText: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, paddingVertical: 13, borderRadius: radius.pill },
  primaryText: { color: colors.onBrand, fontSize: 15, fontFamily: font.heading },
});
