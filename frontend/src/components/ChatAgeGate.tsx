import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

// Shown in place of the message input when a member is under the minimum age
// for messaging. Keeps them able to read but not send.
export default function ChatAgeGate() {
  return (
    <View style={styles.bar}>
      <Ionicons name="lock-closed" size={18} color={colors.onSurfaceSecondary} />
      <Text style={styles.text}>
        Messaging is only available to members aged 13 and over.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    margin: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  text: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 18 },
});
