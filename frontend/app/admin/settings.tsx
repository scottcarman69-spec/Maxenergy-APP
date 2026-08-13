import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

const OPTIONS = [6, 12, 24, 48, 72];

export default function AdminSettings() {
  const [hours, setHours] = useState<number>(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api.adminSettings();
      if (typeof s.cancel_window_hours === "number") setHours(s.cancel_window_hours);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (h: number) => {
    setSaving(true);
    setBanner(null);
    const prev = hours;
    setHours(h);
    try {
      await api.adminUpdateSettings(h);
      setBanner(`Saved — members must now cancel or reschedule at least ${h} hour${h === 1 ? "" : "s"} before.`);
    } catch (e: any) {
      setHours(prev);
      setBanner(e?.message || "Couldn't save. Please try again.");
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Booking Settings" backTestID="settings-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <View style={styles.card}>
            <View style={styles.cardIconRow}>
              <View style={styles.iconChip}>
                <Ionicons name="time" size={22} color={colors.brand} />
              </View>
              <Text style={styles.cardTitle}>Cancel / Reschedule window</Text>
            </View>
            <Text style={styles.cardDesc}>
              How far in advance a member must cancel or reschedule a booking. Requests inside this window are blocked and the member is asked to call the gym.
            </Text>

            <View style={styles.chips}>
              {OPTIONS.map((h) => {
                const on = hours === h;
                return (
                  <Pressable
                    key={h}
                    testID={`cancel-window-${h}`}
                    disabled={saving}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => save(h)}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{h} hrs</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.current}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
              <Text style={styles.currentText}>Current: {hours} hour{hours === 1 ? "" : "s"} before start</Text>
            </View>
          </View>

          {!!banner && (
            <View style={styles.banner}>
              <Ionicons name="information-circle" size={16} color={colors.brand} />
              <Text style={styles.bannerText}>{banner}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardIconRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  iconChip: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800", flex: 1 },
  cardDesc: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 20, marginBottom: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  chipTextOn: { color: colors.onBrand },
  current: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg },
  currentText: { color: colors.onSurface, fontSize: 13.5, fontWeight: "700" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,122,0,0.12)", borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, padding: spacing.md },
  bannerText: { flex: 1, color: colors.onSurface, fontSize: 13, lineHeight: 18 },
});
