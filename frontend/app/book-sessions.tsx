import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { classDate, classTime } from "@/src/datetime";
import ScreenHeader from "@/src/components/ScreenHeader";

type Cls = {
  class_id: string;
  name: string;
  category: string;
  start_at: string;
  started?: boolean;
  ended?: boolean;
  by_appointment?: boolean;
  spots_left?: number;
  capacity?: number;
};

export default function BookSessions() {
  const router = useRouter();
  const { name, category } = useLocalSearchParams<{ name?: string; category?: string }>();
  const [all, setAll] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.classes(undefined, true, 365);
      setAll(r.classes || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // The next 10 upcoming sessions for this exact class type (past auto-excluded).
  const sessions = useMemo(() => {
    const now = Date.now();
    return (all || [])
      .filter((c) => !c.by_appointment && !c.ended)
      .filter((c) => (!name || c.name === name) && (!category || c.category === category))
      .filter((c) => new Date(c.start_at).getTime() > now - 60 * 60 * 1000)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 10);
  }, [all, name, category]);

  const selectedCls = sessions.find((s) => s.class_id === selected) || null;

  const statusOf = (c: Cls): { label: string; kind: "open" | "full" | "closed" } => {
    if (c.started) return { label: "Closed", kind: "closed" };
    if (c.spots_left === 0) return { label: "Full", kind: "full" };
    if (typeof c.spots_left === "number" && c.spots_left <= 3 && c.spots_left > 0)
      return { label: `${c.spots_left} left`, kind: "open" };
    return { label: "Available", kind: "open" };
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title={(name as string) || "Upcoming sessions"} backTestID="book-sessions-back" />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
      ) : (
        <>
          <FlatList
            data={sessions}
            keyExtractor={(c) => c.class_id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 140 }}
            ListHeaderComponent={
              <Text style={styles.intro}>
                Pick a date and time below — showing the next {sessions.length} session{sessions.length === 1 ? "" : "s"}.
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
                <Text style={styles.emptyText}>No upcoming sessions for this class right now.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const st = statusOf(item);
              const selectable = st.kind === "open";
              const isSel = selected === item.class_id;
              return (
                <Pressable
                  testID={`session-card-${item.class_id}`}
                  disabled={!selectable}
                  onPress={() => setSelected(item.class_id)}
                  style={[
                    styles.card,
                    isSel && styles.cardSelected,
                    !selectable && styles.cardDisabled,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                      <View
                        style={[
                          styles.statusPill,
                          st.kind === "full" && styles.statusFull,
                          st.kind === "closed" && styles.statusClosed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            st.kind === "full" && styles.statusTextFull,
                            st.kind === "closed" && styles.statusTextClosed,
                          ]}
                        >
                          {st.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardDay}>{classDate(item.start_at, { weekday: "long", day: "numeric", month: "long" })}</Text>
                    <Text style={styles.cardTime}>{classTime(item.start_at)}</Text>
                  </View>
                  <View style={[styles.radio, isSel && styles.radioOn]}>
                    {isSel && <Ionicons name="checkmark" size={16} color={colors.onBrand} />}
                  </View>
                </Pressable>
              );
            }}
          />

          {selectedCls && (
            <View style={styles.footer}>
              <Pressable
                testID="book-selected"
                style={({ pressed }) => [styles.bookBtn, pressed && { opacity: 0.9 }]}
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: selectedCls.class_id } })}
              >
                <Ionicons name="calendar" size={18} color={colors.onBrand} />
                <Text style={styles.bookBtnText}>
                  BOOK · {classDate(selectedCls.start_at, { weekday: "short", day: "numeric", month: "short" })} · {classTime(selectedCls.start_at)}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.onSurfaceSecondary, fontSize: 13.5, marginBottom: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardSelected: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.brandTertiary },
  cardDisabled: { opacity: 0.55 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardName: { color: colors.onSurface, fontSize: 16, fontWeight: "800", flex: 1 },
  cardDay: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 6 },
  cardTime: { color: colors.brand, fontSize: 14, fontWeight: "800", marginTop: 2 },
  statusPill: { backgroundColor: colors.success + "22", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { color: colors.success, fontSize: 11, fontWeight: "900", letterSpacing: 0.3 },
  statusFull: { backgroundColor: colors.error + "22" },
  statusTextFull: { color: colors.error },
  statusClosed: { backgroundColor: colors.surfaceTertiary },
  statusTextClosed: { color: colors.onSurfaceSecondary },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bookBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 16,
  },
  bookBtnText: { color: colors.onBrand, fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
});
