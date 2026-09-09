import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { api } from "@/src/api";

type Group = {
  class_id: string;
  class_label: string;
  when: string;
  count: number;
  members: { name: string; email?: string }[];
};

export default function TermInterest() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.adminTermInterest();
      setGroups(r.groups || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const notify = (g: Group) => {
    Alert.alert(
      "Notify everyone?",
      `Send a "class is back" message to all ${g.count} member${g.count === 1 ? "" : "s"} waiting for ${g.class_label}? This clears the list afterwards.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Notify",
          onPress: async () => {
            setBusy(g.class_id);
            try {
              const r = await api.adminNotifyInterest(g.class_id);
              Alert.alert("Sent", `Notified ${r.notified} member${r.notified === 1 ? "" : "s"}.`);
              load();
            } catch (e: any) {
              Alert.alert("Couldn't send", e?.message || "Please try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Class Interest / Waitlist" backTestID="ti-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.emptyText}>No one is waiting yet. When members tap “Waitlist” on a class that's on a break, they'll appear here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 60 }}>
          <Text style={styles.help}>Members waiting for classes to return. Tap “Notify all” when a class reopens for booking.</Text>
          {groups.map((g) => (
            <View key={g.class_id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{g.class_label}</Text>
                  {!!g.when && <Text style={styles.when}>Returns {g.when}</Text>}
                </View>
                <View style={styles.countPill}><Text style={styles.countText}>{g.count}</Text></View>
              </View>

              <Pressable testID={`ti-toggle-${g.class_id}`} style={styles.linkRow} onPress={() => setExpanded(expanded === g.class_id ? null : g.class_id)}>
                <Ionicons name={expanded === g.class_id ? "chevron-up" : "chevron-down"} size={16} color={colors.brand} />
                <Text style={styles.linkText}>{expanded === g.class_id ? "Hide members" : "View members"}</Text>
              </Pressable>
              {expanded === g.class_id && (
                <View style={styles.members}>
                  {g.members.map((m, i) => (
                    <Text key={i} style={styles.member}>• {m.name}{m.email ? `  (${m.email})` : ""}</Text>
                  ))}
                </View>
              )}

              <Pressable testID={`ti-notify-${g.class_id}`} style={styles.notifyBtn} disabled={busy === g.class_id} onPress={() => notify(g)}>
                {busy === g.class_id ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Ionicons name="notifications" size={16} color={colors.onBrand} />
                    <Text style={styles.notifyText}>Notify all ({g.count})</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  help: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  when: { color: colors.brand, fontSize: 12, fontWeight: "700", marginTop: 1 },
  countPill: { backgroundColor: colors.brand, minWidth: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  countText: { color: colors.onBrand, fontWeight: "900" },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
  members: { gap: 4, paddingLeft: 4 },
  member: { color: colors.onSurface, fontSize: 13, lineHeight: 19 },
  notifyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.md, marginTop: 2 },
  notifyText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 0.3 },
});
