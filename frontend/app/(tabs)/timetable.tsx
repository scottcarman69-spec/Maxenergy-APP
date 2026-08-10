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
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import ScreenBg from "@/src/components/ScreenBg";
import { teamPhotos } from "@/src/gymPhotos";
import { coachSource } from "@/src/coaches";

function catStyle(category: string, name = ""): { color: string; icon: any } {
  const c = (category || "").toLowerCase();
  const nm = (name || "").toLowerCase();
  if (c.includes("kid") || nm.includes("kid")) return { color: "#22C55E", icon: "karate" };
  if (nm.includes("box") || nm.includes("kick")) return { color: "#3B82F6", icon: "boxing-glove" };
  if (c.includes("boot") || nm.includes("boot")) return { color: "#F59E0B", icon: "weight-lifter" };
  return { color: "#FF7A00", icon: "karate" };
}

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  trainer_photo?: string;
  duration_min: number;
  price_cents: number;
  level: string;
  category: string;
  start_at: string;
  program?: string;
  by_appointment?: boolean;
};

const CATEGORIES = ["All", "Adults", "Kids"];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function Timetable() {
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayOffset, setDayOffset] = useState(0);
  const [category, setCategory] = useState("All");

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
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const filtered = useMemo(() => {
    const target = days[dayOffset];
    if (!target) return [];
    return classes
      .filter((c) => !c.by_appointment)
      .filter((c) => sameDay(new Date(c.start_at), target))
      .filter((c) => category === "All" || c.category === category)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [classes, dayOffset, days, category]);

  const appointmentClasses = useMemo(
    () => classes.filter((c) => c.by_appointment && (category === "All" || c.category === category)),
    [classes, category]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        <Text style={styles.title}>Schedule</Text>
        <Text style={styles.subtitle}>Cairns · Smithfield</Text>
      </View>

      {/* Category filter chips */}
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const active = cat === category;
          return (
            <Pressable
              key={cat}
              testID={`cat-chip-${cat.toLowerCase()}`}
              onPress={() => setCategory(cat)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Day selector */}
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
          ListHeaderComponent={
            appointmentClasses.length > 0 ? (
              <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
                <Text style={styles.apptHeading}>BOOK A SESSION</Text>
                {appointmentClasses.map((item) => (
                  <Pressable
                    key={item.class_id}
                    testID={`appt-row-${item.class_id}`}
                    onPress={() => router.push({ pathname: "/class/[id]", params: { id: item.class_id } })}
                    style={styles.apptCard}
                  >
                    {coachSource(item.trainer, item.trainer_photo) ? (
                      <Pressable
                        testID={`appt-coach-${item.class_id}`}
                        style={styles.apptIcon}
                        onPress={() => router.push({ pathname: "/coach", params: { name: item.trainer } })}
                      >
                        <Image source={coachSource(item.trainer, item.trainer_photo)} style={styles.apptAvatar} contentFit="cover" />
                      </Pressable>
                    ) : (
                      <View style={styles.apptIcon}>
                        <Ionicons name="person" size={20} color={colors.brand} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.className}>{item.name}</Text>
                      <Text style={styles.trainer}>with {item.trainer}</Text>
                      <View style={styles.apptTag}>
                        <Ionicons name="time-outline" size={12} color={colors.brand} />
                        <Text style={styles.apptTagText}>By appointment</Text>
                      </View>
                    </View>
                    <View style={styles.bookPill}>
                      <Text style={styles.bookPillText}>Book</Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.apptHeading}>CLASSES</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No {category !== "All" ? category.toLowerCase() + " " : ""}classes this day.</Text>
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
                <View style={[styles.leftBar, { backgroundColor: catStyle(item.category, item.name).color }]} />
                <View style={styles.cardBody}>
                  {coachSource(item.trainer, item.trainer_photo) ? (
                    <Pressable
                      testID={`coach-avatar-${item.class_id}`}
                      style={styles.logoBadge}
                      onPress={() => router.push({ pathname: "/coach", params: { name: item.trainer } })}
                    >
                      <Image source={coachSource(item.trainer, item.trainer_photo)} style={styles.logoImg} contentFit="cover" />
                      <View style={[styles.catChip, { backgroundColor: catStyle(item.category, item.name).color }]}>
                        <MaterialCommunityIcons name={catStyle(item.category, item.name).icon} size={11} color="#fff" />
                      </View>
                    </Pressable>
                  ) : (
                    <View style={styles.logoBadge}>
                      <MaterialCommunityIcons name={catStyle(item.category, item.name).icon} size={26} color={catStyle(item.category, item.name).color} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardTop}>
                      <Text style={styles.className}>{item.name}</Text>
                      <View style={[styles.catTag, { backgroundColor: catStyle(item.category, item.name).color + "26" }]}>
                        <Text style={[styles.catTagText, { color: catStyle(item.category, item.name).color }]}>{item.category}</Text>
                      </View>
                    </View>
                    <Text style={styles.trainer}>with {item.trainer}</Text>
                    <View style={styles.metaRow}>
                      <View style={styles.pill}>
                        <Text style={styles.pillText}>{item.level}</Text>
                      </View>
                      <Text style={styles.duration}>{item.duration_min} min</Text>
                    </View>
                  </View>
                  <View style={styles.bookOutline}>
                    <Text style={styles.bookOutlineText}>Book</Text>
                  </View>
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
  root: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { ...type.h1 },
  subtitle: { ...type.small, marginTop: 2 },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  chipTextActive: { color: colors.onBrand },
  daysWrap: { paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
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
    paddingLeft: spacing.lg + 4,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  leftBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardBody: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logoBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 52, height: 52 },
  catChip: { position: "absolute", right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceSecondary },
  bookOutline: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  bookOutlineText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  className: { color: colors.onSurface, fontSize: 17, fontWeight: "800", flex: 1 },
  catTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  catTagText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  trainer: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  programTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  programText: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  pill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "700" },
  price: { color: colors.brand, fontSize: 18, fontWeight: "900" },
  duration: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.medium },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  apptHeading: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5 },
  apptCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand },
  apptIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  apptAvatar: { width: 44, height: 44, borderRadius: 22 },
  apptTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  apptTagText: { color: colors.brand, fontSize: 11, fontFamily: font.semibold },
  bookPill: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  bookPillText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 13 },
});
