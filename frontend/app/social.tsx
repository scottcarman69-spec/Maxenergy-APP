import React from "react";
import { StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "@/src/theme";
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
        <FacebookFeed />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
