import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, font } from "@/src/theme";

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTestID?: string;
  /** Where to go if there is no navigation history to pop back to. */
  fallback?: Href;
  /** Optional element rendered on the right (e.g. an action icon). */
  right?: React.ReactNode;
  /** Override the back action (e.g. multi-step forms that go to a previous step). */
  onBack?: () => void;
};

/**
 * One consistent header used across every screen: a back chevron on the left,
 * a centred title (with optional subtitle) and an optional right action.
 * Back is always safe — it pops history when possible, otherwise routes to a
 * sensible fallback so users can never get stuck.
 */
export default function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  backTestID = "screen-back",
  fallback = "/(tabs)/home" as Href,
  right,
  onBack,
}: Props) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {showBack && (
          <Pressable testID={backTestID} onPress={handleBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        )}
      </View>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>

      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  side: { width: 44, justifyContent: "center" },
  sideRight: { alignItems: "flex-end" },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading, textAlign: "center" },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1, textAlign: "center" },
});
