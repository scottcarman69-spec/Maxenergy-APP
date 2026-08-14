import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
  AppState,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { classTime, classDate, scheduleDay, qldTodayUTC } from "@/src/datetime";
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
  ended?: boolean;
  duration_min: number;
  price_cents: number;
  level: string;
  category: string;
  start_at: string;
  program?: string;
  by_appointment?: boolean;
  capacity?: number;
  booked?: number;
  spots_left?: number;
};

const CATEGORIES = ["All", "Adults", "Kids"];

function fmtTime(iso: string) {
  return classTime(iso);
}
function sameDay(a: Date, b: Date) {
  return a.getTime() === b.getTime();
}

export default function Timetable() {
  const router = useRouter();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [bookedKeys, setBookedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [category, setCategory] = useState("All");
  const [today, setToday] = useState(() => qldTodayUTC());

  const load = useCallback(async () => {
    try {
      const r = await api.classes(undefined, true);
      setClasses(r.classes || []);
      const d = qldTodayUTC();
      setToday((prev) => (prev.getTime() === d.getTime() ? prev : d));
    } catch {}
    try {
      const mb = await api.myBookings();
      const active = new Set(["paid", "confirmed", "pending", "reschedule_requested"]);
      const keys = new Set<string>();
      for (const b of (mb.bookings || [])) {
        if (b.cleared || !active.has(b.status)) continue;
        const anchor = b.class_start || b.requested_at;
        if (b.class_id && anchor) keys.add(`${b.class_id}|${scheduleDay(anchor)}`);
      }
      setBookedKeys(keys);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Auto-refresh when the app is reopened (foregrounded) so the schedule is always current.
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        load();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const days = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) =>
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i))
    );
  }, [today]);

  const filtered = useMemo(() => {
    const target = days[dayOffset];
    if (!target) return [];
    return classes
      .filter((c) => !c.by_appointment)
      .filter((c) => sameDay(scheduleDay(c.start_at), target))
      .filter((c) => category === "All" || c.category === category)
      .filter((c) => !c.ended)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [classes, dayOffset, days, category]);

  // For the empty state: did the selected (today's) day have classes that have all ended?
  const allEndedToday = useMemo(() => {
    const target = days[dayOffset];
    if (!target || dayOffset !== 0) return false;
    const todays = classes
      .filter((c) => !c.by_appointment)
      .filter((c) => sameDay(scheduleDay(c.start_at), target))
      .filter((c) => category === "All" || c.category === category);
    return todays.length > 0 && todays.every((c) => c.ended);
  }, [classes, dayOffset, days, category]);

  // The very next upcoming class (for the "ended today" peek).
  const nextClass = useMemo(() => {
    const upcoming = classes
      .filter((c) => !c.by_appointment && !c.ended)
      .filter((c) => category === "All" || c.category === category)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    return upcoming[0] || null;
  }, [classes, category]);

  const goToClassDay = useCallback((iso: string) => {
    const dUTC = scheduleDay(iso).getTime();
    const idx = Math.round((dUTC - today.getTime()) / 86400000);
    if (idx >= 0 && idx < days.length) setDayOffset(idx);
  }, [today, days]);

  const appointmentClasses = useMemo(
    () => classes.filter((c) => c.by_appointment && (category === "All" || c.category === category)),
    [classes, category]
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenBg />
      <View style={styles.header}>
        {router.canGoBack() && (
          <Pressable testID="timetable-back" onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        )}
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
                  {d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" }).toUpperCase()}
                </Text>
                <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d.getUTCDate()}</Text>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
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
                    <View style={[styles.bookPill, item.spots_left === 0 && styles.bookPillFull]}>
                      <Text style={[styles.bookPillText, item.spots_left === 0 && styles.bookPillTextFull]}>
                        {item.spots_left === 0 ? "Full" : "Book"}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.apptHeading}>CLASSES</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={allEndedToday ? "checkmark-done-outline" : "calendar-outline"} size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>
                {allEndedToday
                  ? `${category !== "All" ? category + " classes" : "Classes"} have ended today.`
                  : `No ${category !== "All" ? category.toLowerCase() + " " : ""}classes this day.`}
              </Text>

              {allEndedToday && nextClass && (
                <View style={styles.peekCard}>
                  <Text style={styles.peekLabel}>UP NEXT</Text>
                  <Pressable
                    testID="next-class-peek"
                    style={styles.peekRow}
                    onPress={() => goToClassDay(nextClass.start_at)}
                  >
                    {coachSource(nextClass.trainer, nextClass.trainer_photo) ? (
                      <Image source={coachSource(nextClass.trainer, nextClass.trainer_photo)} style={styles.peekAvatar} contentFit="cover" />
                    ) : (
                      <View style={styles.peekAvatarFallback}>
                        <MaterialCommunityIcons name={catStyle(nextClass.category, nextClass.name).icon} size={20} color={catStyle(nextClass.category, nextClass.name).color} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.peekName} numberOfLines={1}>{nextClass.name}</Text>
                      <Text style={styles.peekWhen}>
                        {classDate(nextClass.start_at, { weekday: "long" })} · {fmtTime(nextClass.start_at)}
                        {nextClass.trainer ? ` · ${nextClass.trainer}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.brand} />
                  </Pressable>
                  <Pressable
                    testID="peek-book-button"
                    style={({ pressed }) => [styles.peekBookBtn, pressed && { opacity: 0.85 }]}
                    onPress={() => router.push({ pathname: "/class/[id]", params: { id: nextClass.class_id } })}
                  >
                    <Ionicons name="flash" size={16} color={colors.onBrand} />
                    <Text style={styles.peekBookText}>{nextClass.by_appointment ? "BOOK SESSION" : "BOOK THIS CLASS"}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => {
            const booked = bookedKeys.has(`${item.class_id}|${scheduleDay(item.start_at)}`);
            return (
            <Pressable
              testID={`class-row-${item.class_id}`}
              onPress={() => router.push({ pathname: "/class/[id]", params: { id: item.class_id } })}
              style={styles.row}
            >
              <View style={styles.card}>
                <View style={[styles.leftBar, { backgroundColor: catStyle(item.category, item.name).color }]} />
                <View style={styles.cardHeader}>
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
                    <Text style={styles.className} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.trainer}>with {item.trainer}</Text>
                  </View>
                  <View style={[styles.bookPill, item.spots_left === 0 && styles.bookPillFull, booked && styles.bookPillBooked]}>
                    <Text style={[styles.bookPillText, item.spots_left === 0 && styles.bookPillTextFull, booked && styles.bookPillTextBooked]}>
                      {booked ? "Booked" : item.spots_left === 0 ? "Full" : "Book"}
                    </Text>
                  </View>
                </View>

                {booked && (
                  <View style={styles.bookedTag}>
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                    <Text style={styles.bookedTagText}>You have already booked this class!</Text>
                  </View>
                )}
                {!booked && typeof item.spots_left === "number" && item.spots_left > 0 && item.spots_left <= 3 && (
                  <View style={styles.nudgeTag}>
                    <Ionicons name="flame" size={12} color={colors.onBrand} />
                    <Text style={styles.nudgeText}>ONLY {item.spots_left} SPOT{item.spots_left === 1 ? "" : "S"} LEFT — BOOK EARLY!</Text>
                  </View>
                )}

                <View style={styles.metaRow}>
                  <View style={[styles.catTag, { backgroundColor: catStyle(item.category, item.name).color + "26" }]}>
                    <Text style={[styles.catTagText, { color: catStyle(item.category, item.name).color }]}>{item.category}</Text>
                  </View>
                  <View style={styles.timePill}>
                    <Ionicons name="time-outline" size={13} color={catStyle(item.category, item.name).color} />
                    <Text style={[styles.timePillText, { color: catStyle(item.category, item.name).color }]}>{fmtTime(item.start_at)}</Text>
                  </View>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{item.level}</Text>
                  </View>
                  <Text style={styles.duration} numberOfLines={1}>{item.duration_min} min</Text>
                  {typeof item.price_cents === "number" && item.price_cents > 0 && (
                    <View style={styles.pricePill}>
                      <Text style={styles.pricePillText}>${(item.price_cents / 100).toFixed(0)}</Text>
                    </View>
                  )}
                </View>

                {typeof item.spots_left === "number" && (item.capacity || 0) > 0 && (
                  <View style={styles.capWrap}>
                    <View style={styles.capTrack}>
                      <View
                        style={[
                          styles.capFill,
                          {
                            width: `${Math.min(100, Math.round(((item.booked || 0) / (item.capacity || 1)) * 100))}%`,
                            backgroundColor: item.spots_left === 0 ? colors.error : item.spots_left <= 3 ? colors.warning : colors.success,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.capText, item.spots_left === 0 && { color: colors.error }]}>
                      {item.spots_left === 0 ? "Class full" : `${item.spots_left} spot${item.spots_left === 1 ? "" : "s"} left`}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  capWrap: { marginTop: spacing.sm, gap: 4 },
  capTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  capFill: { height: 6, borderRadius: 3 },
  capText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceSecondary },
  nudgeTag: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, marginTop: 6 },
  nudgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  backBtn: { marginBottom: 4 },
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
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardBody: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  logoBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: 52, height: 52 },
  catChip: { position: "absolute", right: 0, bottom: 0, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.surfaceSecondary },
  bookOutline: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 8 },
  bookOutlineText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  className: { color: colors.onSurface, fontSize: 17, fontWeight: "800", flex: 1 },
  catTag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "center" },
  catTagText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  trainer: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  programTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  programText: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  timePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  timePillText: { fontSize: 12, fontWeight: "800" },
  pill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "700" },
  price: { color: colors.brand, fontSize: 18, fontWeight: "900" },
  duration: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.medium, flexShrink: 0 },
  pricePill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  pricePillText: { color: colors.brand, fontSize: 12, fontWeight: "900" },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  peekCard: { alignSelf: "stretch", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, padding: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  peekLabel: { color: colors.brand, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  peekRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  peekAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary },
  peekAvatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  peekName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  peekWhen: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  peekBookBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 12, marginTop: spacing.xs },
  peekBookText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 0.8, fontSize: 13 },
  apptHeading: { color: colors.onSurfaceSecondary, fontSize: 12, fontFamily: font.heading, letterSpacing: 1.5 },
  apptCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.brand },
  apptIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  apptAvatar: { width: 44, height: 44, borderRadius: 22 },
  apptTag: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  apptTagText: { color: colors.brand, fontSize: 11, fontFamily: font.semibold },
  bookPill: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, flexShrink: 0 },
  bookPillText: { color: colors.onBrand, fontFamily: font.heading, fontSize: 13 },
  bookPillFull: { backgroundColor: colors.surfaceTertiary },
  bookPillTextFull: { color: colors.onSurfaceSecondary },
  bookPillBooked: { backgroundColor: colors.success + "26", borderWidth: 1, borderColor: colors.success },
  bookPillTextBooked: { color: colors.success },
  bookedTag: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: colors.success + "22", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, marginTop: 6 },
  bookedTagText: { color: colors.success, fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },
});
