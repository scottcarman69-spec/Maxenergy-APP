import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

export default function InboxSettings() {
  const [enabled, setEnabled] = useState(true);
  const [remHours, setRemHours] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      setEnabled(me?.user?.message_notifications !== false);
      setRemHours(typeof me?.user?.reminder_hours === "number" ? me.user.reminder_hours : 3);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (val: boolean) => {
    setEnabled(val);
    setSaving(true);
    try { await api.setMessageNotifications(val); }
    catch { setEnabled(!val); }
    setSaving(false);
  };

  const setReminderHours = async (hours: number) => {
    const prev = remHours;
    setRemHours(hours);
    try { await api.setReminderPreference(hours); }
    catch { setRemHours(prev); }
  };

  const remOn = remHours > 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Message Settings" fallback="/(tabs)/inbox" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Text style={styles.section}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.iconWrap}><Ionicons name="chatbubbles" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Message notifications</Text>
              <Text style={styles.sub}>Get alerts for new group, friend and gym messages.</Text>
            </View>
            <Switch
              testID="toggle-message-notifications"
              value={enabled}
              onValueChange={toggle}
              disabled={saving}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={"#fff"}
            />
          </View>
          <Text style={styles.note}>
            {enabled
              ? "You'll be notified about new messages in your Inbox."
              : "Message notifications are off. You won't get alerts — new messages still appear in your Inbox."}
          </Text>

          <Text style={[styles.section, { marginTop: spacing.lg }]}>CLASS REMINDERS</Text>
          <View style={styles.card}>
            <View style={styles.iconWrap}><Ionicons name="alarm" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Class reminders</Text>
              <Text style={styles.sub}>Get a reminder before a class you've booked.</Text>
            </View>
            <Switch
              testID="toggle-class-reminders"
              value={remOn}
              onValueChange={(val) => setReminderHours(val ? 3 : 0)}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={"#fff"}
            />
          </View>
          {remOn && (
            <View style={styles.chipRow}>
              {[1, 3, 12].map((h) => {
                const on = remHours === h;
                return (
                  <Pressable key={h} testID={`reminder-lead-${h}`} style={[styles.chip, on && styles.chipOn]} onPress={() => setReminderHours(h)}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{h} hr{h > 1 ? "s" : ""} before</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <Text style={styles.note}>
            {remOn
              ? `We'll remind you about ${remHours} hour${remHours > 1 ? "s" : ""} before each booked class.`
              : "Class reminders are off. You won't be reminded before your booked classes."}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  iconWrap: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  note: { color: colors.onSurfaceSecondary, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 4 },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surfaceSecondary },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  chipTextOn: { color: colors.brand },
});
