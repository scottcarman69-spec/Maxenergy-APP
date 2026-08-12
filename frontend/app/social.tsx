import React from "react";
import { StyleSheet, ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import FacebookFeed from "@/src/components/FacebookFeed";

export default function SocialScreen() {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Our Facebook" fallback="/(tabs)/home" />
      <ScrollView
        contentContainerStyle={{ paddingVertical: spacing.lg, paddingBottom: 60 }}
        showsVerticalScrollIndicator
      >
        <View style={styles.notice}>
          <Ionicons name="heart" size={18} color={colors.brand} />
          <Text style={styles.noticeText}>Please like and follow our social media to stay up to date! 💥</Text>
        </View>
        <FacebookFeed />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  noticeText: { flex: 1, color: colors.onSurface, fontSize: 13.5, fontWeight: "700", lineHeight: 19 },
});

