import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Sortable from "react-native-sortables";
import { groupLogo } from "@/src/groups";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { QUICK_ACTIONS_META, orderKeys, HOME_QUICK_COUNT, QuickActionMeta } from "@/src/quickActions";

export default function CustomizeActions() {
  const { user, refresh } = useAuth();

  const [data, setData] = useState<QuickActionMeta[]>([]);

  // Load the authoritative saved order fresh (context may not be hydrated yet).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        let savedOrder: string[] | undefined;
        let memberActive = !!user?.membership_active;
        try {
          const me = await api.me();
          savedOrder = me?.user?.quick_actions_order;
          memberActive = !!me?.user?.membership_active;
        } catch {
          savedOrder = user?.quick_actions_order;
        }
        const avail = QUICK_ACTIONS_META.filter((a) => !(a.key === "membership" && memberActive));
        const ordered = orderKeys(avail.map((a) => a.key), savedOrder)
          .map((k) => avail.find((a) => a.key === k))
          .filter(Boolean) as QuickActionMeta[];
        if (active) setData(ordered);
      })();
      return () => { active = false; };
    }, [])
  );

  const persist = async (next: QuickActionMeta[]) => {
    setData(next);
    try {
      await api.setQuickActionsOrder(next.map((a) => a.key));
      await refresh();
    } catch {
      /* keep local order even if save fails */
    }
  };

  const renderItem = ({ item, index }: { item: QuickActionMeta; index: number }) => {
    const onHome = index < HOME_QUICK_COUNT;
    return (
      <View style={[styles.cell, onHome && styles.cellHome]}>
        {onHome && (
          <View style={styles.homeBadge}>
            <Ionicons name="home" size={9} color={colors.onBrand} />
          </View>
        )}
        <LinearGradient
          colors={item.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.icon}
        >
          {item.key === "academy" ? (
            <Image source={groupLogo("muay-thai-academy") as any} style={styles.logo} contentFit="contain" />
          ) : (
            <Ionicons name={item.icon as any} size={18} color="#fff" />
          )}
        </LinearGradient>
        <Text style={styles.label} numberOfLines={2}>{item.label}</Text>
        <Ionicons name="reorder-three" size={16} color={colors.onSurfaceSecondary} style={styles.grip} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Customise Quick Actions" backTestID="customize-back" fallback="/(tabs)/home" />
      <View style={styles.intro}>
        <Ionicons name="hand-left-outline" size={16} color={colors.brand} />
        <Text style={styles.introText}>
          Press &amp; hold a tile, then drag to reorder. The first {HOME_QUICK_COUNT} appear on your home screen — the rest sit under “More actions”.
        </Text>
      </View>
      <View style={styles.gridWrap}>
        <Sortable.Grid
          columns={3}
          data={data}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          rowGap={spacing.md}
          columnGap={spacing.md}
          onDragEnd={({ data: next }) => persist(next)}
        />
        <View style={styles.legend}>
          <View style={styles.homeBadgeStatic}>
            <Ionicons name="home" size={9} color={colors.onBrand} />
          </View>
          <Text style={styles.legendText}>Shown on your home screen</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  introText: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  gridWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  cell: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 104,
    justifyContent: "space-between",
  },
  cellHome: { borderColor: colors.brand },
  homeBadge: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  logo: { width: 34, height: 34 },
  label: { color: colors.onSurface, fontSize: 13, fontFamily: font.heading },
  grip: { position: "absolute", bottom: 6, right: 8 },
  legend: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg },
  homeBadgeStatic: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12.5 },
});
