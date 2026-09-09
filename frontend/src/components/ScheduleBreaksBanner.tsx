import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";

type Brk = {
  label: string;
  reason: string;
  until: string;
  resumes_on: string;
  resumes_label: string;
  resumes_class_id: string;
};

// Shows "on school-holiday break — resumes X, book next term" cards for any class
// that's currently hidden by a schedule exception. Used on Home and the Timetable.
export default function ScheduleBreaksBanner() {
  const router = useRouter();
  const [breaks, setBreaks] = useState<Brk[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api.scheduleBreaks();
      setBreaks(r.breaks || []);
    } catch {
      setBreaks([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (breaks.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {breaks.map((b) => (
        <View key={b.label} style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="school-outline" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{b.label} is on a break</Text>
              <Text style={styles.sub}>{b.reason} · resumes {b.resumes_label}</Text>
            </View>
          </View>
          <Pressable
            testID={`break-book-${b.resumes_class_id}`}
            style={styles.btn}
            onPress={() => router.push(`/class/${b.resumes_class_id}`)}
          >
            <Text style={styles.btnText}>Book next term</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.onBrand} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand,
    borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 1 },
  btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.brand, paddingVertical: 10, borderRadius: radius.md,
  },
  btnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 0.3 },
});
