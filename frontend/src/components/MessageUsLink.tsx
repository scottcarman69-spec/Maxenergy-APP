import React from "react";
import { Text, StyleSheet, Pressable, ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

/**
 * Small tap-to-support link that opens the in-app "Maxenergy Team" chat (/chat/gym).
 * Drop it on any screen where a member might need help.
 */
export default function MessageUsLink({ label = "Need help? Message us", style, testID = "message-us-link" }: {
  label?: string;
  style?: ViewStyle;
  testID?: string;
}) {
  const router = useRouter();
  return (
    <Pressable testID={testID} style={[styles.wrap, style]} onPress={() => router.push("/chat/gym")}>
      <Ionicons name="chatbubbles-outline" size={18} color={colors.brand} />
      <Text style={styles.text}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  text: { flex: 1, color: colors.onSurface, fontSize: 14, fontWeight: "700" },
});
