import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type } from "@/src/theme";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  duration_min: number;
  price_cents: number;
  level: string;
  start_at: string;
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Timetable() {
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.classes();
      setClasses(r.classes || []);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const filtered = useMemo(() => {
    const target = days[dayOffset];
    if (!target) return [];
    return classes
      .filter((c) => sameDay(new Date(c.start_at), target))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [classes, dayOffset, days]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Timetable</Text>
        <Text style={styles.subtitle}>Cairns · Smithfield</Text>
      </View>

      <View style={styles.daysWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}
        >
          {days.map((d, i) => {
            const active = i === dayOffset;
            return (
              <Pressable
                key={i}
                testID={`day-chip-${i}`}
                onPress={() => setDayOffset(i)}
                style={[styles.dayChip, active && styles.dayChipActive]}
              >
                <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>
                  {d.toLocaleDateString([], { weekday: "short" }).toUpperCase()}
                </Text>
                <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.getDate()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.class_id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No classes scheduled for this day.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`class-row-${item.class_id}`}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: item.class_id } })}
              style={styles.row}
            >
              <View style={styles.timeCol}>
                <Text style={styles.time}>{fmtTime(item.start_at)}</Text>
                <Text style={styles.dur}>{item.duration_min}m</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.className}>{item.name}</Text>
                <Text style={styles.trainer}>with {item.trainer}</Text>
                <View style={styles.metaRow}>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{item.level}</Text>
                  </View>
                  <Text style={styles.price}>${(item.price_cents / 100).toFixed(0)}</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...type.h1 },
  subtitle: { ...type.small, marginTop: 2 },
  daysWrap: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayChip: {
    width: 56,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dayChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  dayLabelActive: { color: colors.onBrand },
  dayNum: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginTop: 4 },
  dayNumActive: { color: colors.onBrand },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  timeCol: { width: 60, alignItems: "flex-end", paddingTop: spacing.md },
  time: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  dur: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 2 },
  card: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  className: { color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  trainer: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  pill: {
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: { color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  price: { color: colors.brand, fontSize: 18, fontWeight: "900" },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14 },
});
