import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking, Modal, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import { classTime, classDate, scheduleDay, qldTodayUTC } from "@/src/datetime";

type Booking = {
  booking_id: string;
  class_id?: string;
  class_name: string;
  status: string;
  amount: number;
  by_appointment?: boolean;
  requested_time?: string;
  requested_at?: string;
  scheduled_time?: string;
  class_start?: string;
  member_name?: string;
  member_email?: string;
  member_phone?: string;
  attended?: boolean;
};

type ClassSession = {
  class_id: string;
  name: string;
  trainer?: string;
  category?: string;
  start_at?: string;
  by_appointment?: boolean;
};

const CLASS_COLOR = "#3B82F6";

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: colors.success },
  confirmed: { label: "Confirmed", color: colors.success },
  pending: { label: "Pending", color: colors.warning },
  reschedule_requested: { label: "Reschedule", color: "#B45309" },
  cancelled: { label: "Cancelled", color: colors.info },
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const FILTERS = ["All", "Classes", "Confirmed", "Pending", "Cancelled"] as const;
type Filter = (typeof FILTERS)[number];
function matchesFilter(status: string, f: Filter): boolean {
  if (f === "All") return true;
  if (f === "Classes") return false;
  if (f === "Confirmed") return status === "confirmed" || status === "paid";
  if (f === "Pending") return status === "pending" || status === "reschedule_requested";
  return status === "cancelled";
}
function timeOf(iso: string): number {
  const parsed = new Date(iso.match(/[zZ]|[+-]\d{2}:?\d{2}$/) ? iso : iso + "Z");
  return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
}

// The date a booking sits on: fixed classes use class_start; appointments use
// their (preferred/confirmed) requested_at. Both are Queensland wall-clock.
function anchorIso(b: Booking): string | null {
  if (b.by_appointment) return b.requested_at || null;
  return b.class_start || null;
}
function dayKeyOf(iso: string): string {
  return scheduleDay(iso).toISOString().slice(0, 10);
}
function anchorHour(b: Booking): number {
  const iso = anchorIso(b);
  if (!iso) return 9999; // no time → sort last
  const d = scheduleDay(iso);
  const parsed = new Date(iso.match(/[zZ]|[+-]\d{2}:?\d{2}$/) ? iso : iso + "Z");
  return parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
}

const WEEKDAY_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function addDaysUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}
// Monday (UTC) of the week containing the given YYYY-MM-DD key.
function mondayOfKey(key: string): Date {
  const d = new Date(key + "T00:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return addDaysUTC(d, -wd);
}
function keyOfDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function AdminCalendar() {
  const router = useRouter();
  const [rows, setRows] = useState<Booking[]>([]);
  const [classes, setClasses] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(() => {
    const t = qldTodayUTC();
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  });
  const [selected, setSelected] = useState<string>(() => qldTodayUTC().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<Filter>("All");
  const [actioning, setActioning] = useState<string | null>(null);
  const [classModal, setClassModal] = useState<ClassSession | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [weekAnchor, setWeekAnchor] = useState<Date>(() => mondayOfKey(qldTodayUTC().toISOString().slice(0, 10)));
  const [pagerW, setPagerW] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [b, c] = await Promise.all([api.adminBookings(), api.classes(undefined, true)]);
      setRows(b.bookings || []);
      setClasses((c.classes || []).filter((x: ClassSession) => !x.by_appointment && x.start_at));
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showClasses = filter === "All" || filter === "Classes";

  const classesByDay = useMemo(() => {
    const m: Record<string, ClassSession[]> = {};
    if (!showClasses) return m;
    for (const c of classes) {
      if (!c.start_at) continue;
      (m[dayKeyOf(c.start_at)] ||= []).push(c);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => timeOf(a.start_at!) - timeOf(b.start_at!));
    return m;
  }, [classes, showClasses]);

  const toggleAttend = async (b: Booking) => {
    setActioning(b.booking_id);
    try {
      await api.adminSetAttendance(b.booking_id, !b.attended);
      await load();
    } catch {}
    setActioning(null);
  };

  const grouped = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of rows) {
      if (!matchesFilter(b.status, filter)) continue;
      const iso = anchorIso(b);
      if (!iso) continue;
      const k = dayKeyOf(iso);
      (m[k] ||= []).push(b);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => anchorHour(a) - anchorHour(b));
    return m;
  }, [rows, filter]);

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const todayKey = qldTodayUTC().toISOString().slice(0, 10);

  const cells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 Sun
    const leading = (firstWeekday + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < leading; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const keyFor = (d: number) =>
    new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10);

  const monthEntries = useMemo(
    () => cells.reduce<number>((n, d) => {
      if (!d) return n;
      const k = keyFor(d);
      return n + (grouped[k]?.length || 0) + (classesByDay[k]?.length || 0);
    }, 0),
    [cells, grouped, classesByDay, year, month]
  );

  const dayList = grouped[selected] || [];
  const dayClasses = classesByDay[selected] || [];
  const selectedLabel = classDate(selected + "T00:00:00", { weekday: "long", day: "numeric", month: "long" });

  const shiftMonth = (delta: number) => {
    setCursor(new Date(Date.UTC(year, month + delta, 1)));
  };

  // ---- Week view helpers ----
  const weekDays = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDaysUTC(weekAnchor, i)), [weekAnchor]);
  const weekEntries = useMemo(
    () => weekDays.reduce<number>((n, d) => {
      const k = keyOfDate(d);
      return n + (grouped[k]?.length || 0) + (classesByDay[k]?.length || 0);
    }, 0),
    [weekDays, grouped, classesByDay]
  );
  const weekRangeLabel = useMemo(() => {
    const start = weekAnchor;
    const end = addDaysUTC(weekAnchor, 6);
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    const startStr = start.toLocaleDateString("en-AU", { day: "numeric", month: sameMonth ? undefined : "short", timeZone: "UTC" });
    const endStr = end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${startStr} – ${endStr}`;
  }, [weekAnchor]);

  const shiftWeek = (delta: number) => setWeekAnchor((a) => addDaysUTC(a, delta * 7));

  // keep the swipe pager centred on the current week
  useEffect(() => {
    if (viewMode === "week" && pagerW > 0) {
      pagerRef.current?.scrollTo({ x: pagerW, animated: false });
    }
  }, [weekAnchor, viewMode, pagerW]);

  const onWeekScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerW <= 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pagerW);
    if (page === 0) shiftWeek(-1);
    else if (page === 2) shiftWeek(1);
  };

  const shiftPeriod = (delta: number) => (viewMode === "month" ? shiftMonth(delta) : shiftWeek(delta));

  const dotColors = (dayBookings: Booking[]): string[] => {
    const order = [colors.success, colors.warning, "#B45309", colors.info];
    const present = new Set(dayBookings.map((b) => (STATUS[b.status] || STATUS.pending).color));
    return order.filter((c) => present.has(c)).slice(0, 3);
  };

  const renderWeekDay = (d: Date) => {
    const key = keyOfDate(d);
    const dayBookings = grouped[key] || [];
    const dayCount = dayBookings.length + (classesByDay[key]?.length || 0);
    const isToday = key === todayKey;
    const isSel = key === selected;
    return (
      <Pressable
        key={key}
        testID={`admincal-weekday-${d.getUTCDate()}`}
        style={[styles.weekCell, isSel && styles.weekCellSel, isToday && !isSel && styles.weekCellToday]}
        onPress={() => setSelected(key)}
      >
        <Text style={[styles.weekCellLabel, isSel && styles.weekCellTextSel]}>{WEEKDAY_FULL[(d.getUTCDay() + 6) % 7]}</Text>
        <Text style={[styles.weekCellNum, isSel && styles.weekCellTextSel, isToday && !isSel && { color: colors.brand }]}>{d.getUTCDate()}</Text>
        <View style={styles.dots}>
          {[...(classesByDay[key]?.length ? [CLASS_COLOR] : []), ...dotColors(dayBookings)].slice(0, 3).map((c, di) => (
            <View key={di} style={[styles.dot, { backgroundColor: c }]} />
          ))}
        </View>
        {dayCount > 0 ? (
          <View style={[styles.weekCountPill, isSel && styles.weekCountPillSel]}>
            <Text style={[styles.weekCountText, isSel && styles.weekCellTextSel]}>{dayCount > 9 ? "9+" : dayCount}</Text>
          </View>
        ) : (
          <View style={{ height: 18 }} />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="admincal-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Bookings Calendar</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 48 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
            style={{ marginBottom: spacing.lg }}
          >
            {FILTERS.map((f) => (
              <Pressable key={f} testID={`admincal-filter-${f}`} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipOn]}>
                <Text style={[styles.filterText, filter === f && styles.filterTextOn]}>{f}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.calCard}>
          <View style={styles.toggleRow}>
            <Pressable testID="admincal-view-month" onPress={() => setViewMode("month")} style={[styles.toggleBtn, viewMode === "month" && styles.toggleBtnOn]}>
              <Ionicons name="calendar-outline" size={15} color={viewMode === "month" ? colors.onBrand : colors.onSurfaceSecondary} />
              <Text style={[styles.toggleText, viewMode === "month" && styles.toggleTextOn]}>Month</Text>
            </Pressable>
            <Pressable testID="admincal-view-week" onPress={() => setViewMode("week")} style={[styles.toggleBtn, viewMode === "week" && styles.toggleBtnOn]}>
              <Ionicons name="reorder-four-outline" size={16} color={viewMode === "week" ? colors.onBrand : colors.onSurfaceSecondary} />
              <Text style={[styles.toggleText, viewMode === "week" && styles.toggleTextOn]}>Week</Text>
            </Pressable>
          </View>

          <View style={styles.monthBar}>
            <Pressable testID="admincal-prev" onPress={() => shiftPeriod(-1)} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
            </Pressable>
            <View style={{ alignItems: "center" }}>
              <Text style={styles.monthTitle}>
                {viewMode === "month"
                  ? cursor.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" })
                  : weekRangeLabel}
              </Text>
              <Text style={styles.monthSub}>
                {viewMode === "month" ? monthEntries : weekEntries} item{(viewMode === "month" ? monthEntries : weekEntries) === 1 ? "" : "s"}
              </Text>
            </View>
            <Pressable testID="admincal-next" onPress={() => shiftPeriod(1)} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
            </Pressable>
          </View>

          {viewMode === "month" ? (
            <>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={i} style={styles.weekLabel}>{w}</Text>
                ))}
              </View>

              <View style={styles.grid}>
                {cells.map((d, i) => {
                  if (!d) return <View key={i} style={styles.cell} />;
                  const key = keyFor(d);
                  const dayBookings = grouped[key] || [];
                  const dayCount = dayBookings.length + (classesByDay[key]?.length || 0);
                  const isToday = key === todayKey;
                  const isSel = key === selected;
                  return (
                    <Pressable
                      key={i}
                      testID={`admincal-day-${d}`}
                      style={[styles.cell, styles.cellDay, isSel && styles.cellSel, isToday && !isSel && styles.cellToday]}
                      onPress={() => setSelected(key)}
                    >
                      {dayCount > 0 && (
                        <View style={styles.countBadge} testID={`admincal-count-${d}`}>
                          <Text style={styles.countBadgeText}>{dayCount > 9 ? "9+" : dayCount}</Text>
                        </View>
                      )}
                      <Text style={[styles.cellNum, isSel && styles.cellNumSel, isToday && !isSel && styles.cellNumToday]}>{d}</Text>
                      <View style={styles.dots}>
                        {[...(classesByDay[key]?.length ? [CLASS_COLOR] : []), ...dotColors(dayBookings)].slice(0, 3).map((c, di) => (
                          <View key={di} style={[styles.dot, { backgroundColor: c }]} />
                        ))}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <View style={styles.weekPagerWrap} onLayout={(e) => setPagerW(e.nativeEvent.layout.width)}>
              {pagerW > 0 && (
                <ScrollView
                  ref={pagerRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onWeekScrollEnd}
                  contentOffset={{ x: pagerW, y: 0 }}
                >
                  {[-1, 0, 1].map((off) => (
                    <View key={off} style={{ width: pagerW, flexDirection: "row" }}>
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => renderWeekDay(addDaysUTC(weekAnchor, off * 7 + i)))}
                    </View>
                  ))}
                </ScrollView>
              )}
              <Text style={styles.swipeHint}>‹ Swipe to change week ›</Text>
            </View>
          )}

          <View style={styles.legend}>
            {[["Class", CLASS_COLOR], ["Confirmed / Paid", colors.success], ["Pending / Reschedule", colors.warning], ["Cancelled", colors.info]].map(([l, c]) => (
              <View key={l as string} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: c as string }]} />
                <Text style={styles.legendText}>{l}</Text>
              </View>
            ))}
          </View>
          </View>

          <Text style={styles.agendaTitle}>{selectedLabel}</Text>
          {dayList.length === 0 && dayClasses.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-clear-outline" size={34} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>Nothing on this day.</Text>
            </View>
          ) : (
            <>
              {dayClasses.map((c) => (
                <Pressable
                  key={c.class_id}
                  testID={`admincal-class-${c.class_id}`}
                  style={styles.classItem}
                  onPress={() => setClassModal(c)}
                >
                  <View style={[styles.itemBar, { backgroundColor: CLASS_COLOR }]} />
                  <View style={styles.itemTime}>
                    <Text style={styles.itemTimeText}>{c.start_at ? classTime(c.start_at) : ""}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.itemMember} numberOfLines={1}>
                      {c.category || "Class"}{c.trainer ? ` · ${c.trainer}` : ""}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: CLASS_COLOR }]}>
                    <Text style={styles.pillText}>CLASS</Text>
                  </View>
                </Pressable>
              ))}
              {dayList.map((b) => {
              const meta = STATUS[b.status] || { label: b.status, color: colors.info };
              const iso = anchorIso(b);
              const timeLabel = iso ? classTime(iso) : (b.scheduled_time || "Time TBC");
              const busy = actioning === b.booking_id;
              const canAttend = b.status !== "cancelled";
              return (
                <View key={b.booking_id} testID={`admincal-booking-${b.booking_id}`} style={styles.itemCard}>
                  <Pressable style={styles.item} onPress={() => router.push("/admin/bookings")}>
                    <View style={[styles.itemBar, { backgroundColor: meta.color }]} />
                    <View style={styles.itemTime}>
                      <Text style={styles.itemTimeText}>{timeLabel}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{b.class_name}</Text>
                      <Text style={styles.itemMember} numberOfLines={1}>{b.member_name || "Member"}</Text>
                      {!!b.member_phone && (
                        <View style={styles.phoneRow}>
                          <Pressable
                            testID={`admincal-call-${b.booking_id}`}
                            style={styles.contactBtn}
                            onPress={() => Linking.openURL(`tel:${(b.member_phone || "").replace(/[^\d+]/g, "")}`)}
                          >
                            <Ionicons name="call" size={13} color={colors.onBrand} />
                            <Text style={styles.contactText}>Call</Text>
                          </Pressable>
                          <Pressable
                            testID={`admincal-text-${b.booking_id}`}
                            style={styles.contactBtnGhost}
                            onPress={() => Linking.openURL(`sms:${(b.member_phone || "").replace(/[^\d+]/g, "")}`)}
                          >
                            <Ionicons name="chatbubble-ellipses" size={13} color={colors.brand} />
                            <Text style={styles.contactTextGhost}>Text</Text>
                          </Pressable>
                          <Text style={styles.phoneNum} numberOfLines={1}>{b.member_phone}</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.pill, { backgroundColor: meta.color }]}>
                      <Text style={styles.pillText}>{meta.label.toUpperCase()}</Text>
                    </View>
                  </Pressable>
                  {canAttend && (
                    <Pressable
                      testID={`admincal-attend-${b.booking_id}`}
                      style={[styles.attendBar, b.attended && styles.attendBarOn]}
                      disabled={busy}
                      onPress={() => toggleAttend(b)}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={b.attended ? "#fff" : colors.onSurface} />
                      ) : (
                        <>
                          <Ionicons name={b.attended ? "checkmark-circle" : "person-add-outline"} size={16} color={b.attended ? "#fff" : colors.onSurface} />
                          <Text style={[styles.attendText, b.attended && { color: "#fff" }]}>
                            {b.attended ? "Attended ✓  (tap to undo)" : "Confirm attended"}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })}
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={!!classModal} transparent animationType="slide" onRequestClose={() => setClassModal(null)}>
        <View style={styles.mOverlay}>
          <View style={styles.mSheet}>
            <View style={styles.mHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mTitle}>{classModal?.name}</Text>
                <Text style={styles.mSub}>
                  {classModal?.start_at ? `${classDate(classModal.start_at, { weekday: "short", day: "2-digit", month: "short" })} · ${classTime(classModal.start_at)}` : ""}
                  {classModal?.trainer ? ` · ${classModal.trainer}` : ""}
                </Text>
              </View>
              <Pressable testID="admincal-class-close" onPress={() => setClassModal(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>

            {(() => {
              const attendees = classModal
                ? rows.filter((r) => r.class_id === classModal.class_id && r.status !== "cancelled")
                : [];
              const attCount = attendees.filter((a) => a.attended).length;
              if (attendees.length === 0) {
                return (
                  <View style={styles.empty}>
                    <Ionicons name="people-outline" size={34} color={colors.onSurfaceSecondary} />
                    <Text style={styles.emptyText}>No one has booked this class yet.</Text>
                  </View>
                );
              }
              return (
                <>
                  <Text style={styles.mCount}>{attendees.length} booked · {attCount} attended</Text>
                  <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: spacing.sm }}>
                    {attendees.map((b) => {
                      const busy = actioning === b.booking_id;
                      const num = (b.member_phone || "").replace(/[^\d+]/g, "");
                      return (
                        <View key={b.booking_id} style={styles.rosterRow}>
                          <Pressable
                            testID={`roster-attend-${b.booking_id}`}
                            style={[styles.checkbox, b.attended && styles.checkboxOn]}
                            disabled={busy}
                            onPress={() => toggleAttend(b)}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={b.attended ? "#fff" : colors.brand} />
                            ) : (
                              <Ionicons name={b.attended ? "checkmark" : "ellipse-outline"} size={18} color={b.attended ? "#fff" : colors.onSurfaceSecondary} />
                            )}
                          </Pressable>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rosterName} numberOfLines={1}>{b.member_name || "Member"}</Text>
                            {!!b.member_phone && <Text style={styles.rosterPhone} numberOfLines={1}>{b.member_phone}</Text>}
                          </View>
                          {!!num && (
                            <>
                              <Pressable testID={`roster-call-${b.booking_id}`} style={styles.rosterIcon} onPress={() => Linking.openURL(`tel:${num}`)}>
                                <Ionicons name="call" size={16} color={colors.brand} />
                              </Pressable>
                              <Pressable testID={`roster-text-${b.booking_id}`} style={styles.rosterIcon} onPress={() => Linking.openURL(`sms:${num}`)}>
                                <Ionicons name="chatbubble-ellipses" size={16} color={colors.brand} />
                              </Pressable>
                            </>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.mHint}>Tap the circle to mark a member attended.</Text>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  filterRow: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.lg },
  filterChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  filterChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  filterTextOn: { color: colors.onBrand },
  calCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  toggleRow: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 3, marginBottom: spacing.md },
  toggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: radius.pill },
  toggleBtnOn: { backgroundColor: colors.brand },
  toggleText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  toggleTextOn: { color: colors.onBrand },
  weekPagerWrap: { marginTop: 2 },
  weekCell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 8, borderRadius: radius.md },
  weekCellSel: { backgroundColor: colors.brand },
  weekCellToday: { borderWidth: 1.5, borderColor: colors.brand },
  weekCellLabel: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  weekCellNum: { color: colors.onSurface, fontSize: 18, fontWeight: "900", marginTop: 3 },
  weekCellTextSel: { color: colors.onBrand },
  weekCountPill: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginTop: 5 },
  weekCountPillSel: { backgroundColor: "rgba(255,255,255,0.25)" },
  weekCountText: { color: colors.brand, fontSize: 10, fontWeight: "900" },
  swipeHint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: spacing.sm, letterSpacing: 0.5 },
  monthBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  navBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  monthTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  monthSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekLabel: { flex: 1, textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellDay: { alignItems: "center", justifyContent: "center" },
  countBadge: { position: "absolute", top: 0, right: 4, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", zIndex: 2 },
  countBadgeText: { color: colors.onBrand, fontSize: 9, fontWeight: "900" },
  cellSel: { },
  cellToday: { },
  cellNum: { color: colors.onSurface, fontSize: 15, fontWeight: "700", width: 30, height: 30, borderRadius: 15, textAlign: "center", textAlignVertical: "center", lineHeight: 30 },
  cellNumSel: { backgroundColor: colors.brand, color: colors.onBrand, overflow: "hidden" },
  cellNumToday: { color: colors.brand, borderWidth: 1.5, borderColor: colors.brand, overflow: "hidden" },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  agendaTitle: { color: colors.onSurface, fontSize: 16, fontFamily: font.heading, marginBottom: spacing.md },
  empty: { alignItems: "center", padding: 40, gap: spacing.sm },
  emptyText: { color: colors.onSurfaceSecondary },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, overflow: "hidden" },
  classItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm, overflow: "hidden" },
  itemCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.sm },
  itemBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  itemTime: { width: 62 },
  itemTimeText: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  itemName: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  itemMember: { color: colors.onSurface, fontSize: 12, marginTop: 2 },
  itemPhone: { color: colors.brand, fontSize: 12, marginTop: 2, fontWeight: "700" },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  contactText: { color: colors.onBrand, fontSize: 11, fontWeight: "800" },
  contactBtnGhost: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  contactTextGhost: { color: colors.brand, fontSize: 11, fontWeight: "800" },
  phoneNum: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  attendBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  attendBarOn: { backgroundColor: "#16A34A" },
  attendText: { color: colors.onSurface, fontWeight: "800", fontSize: 13 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.5 },
  mOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  mSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl, paddingBottom: spacing.xl + 12, borderWidth: 1, borderColor: colors.border },
  mHeader: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  mTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  mSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 2 },
  mCount: { color: colors.brand, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginBottom: spacing.sm },
  mHint: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.sm },
  rosterRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  checkbox: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  rosterName: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rosterPhone: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  rosterIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
});
