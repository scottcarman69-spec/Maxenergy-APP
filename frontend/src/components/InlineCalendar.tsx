import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

type Props = {
  value: Date;
  onChange: (d: Date) => void;
  minDate?: Date; // dates before this are disabled (defaults to today)
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

/** Compact month calendar. Pure RN (web + native), dark-theme styled. Date only —
 * pair with a time field for exact date/time selection. */
export default function InlineCalendar({ value, onChange, minDate }: Props) {
  const [view, setView] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const min = startOfDay(minDate || new Date());

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const selected = startOfDay(value);
  const changeMonth = (delta: number) => setView(new Date(year, month + delta, 1));

  return (
    <View style={styles.wrap} testID="inline-calendar">
      <View style={styles.header}>
        <Pressable testID="cal-prev" onPress={() => changeMonth(-1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.monthLabel}>{MONTHS[month]} {year}</Text>
        <Pressable testID="cal-next" onPress={() => changeMonth(1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurface} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>{w}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const cellDate = startOfDay(new Date(year, month, d));
          const disabled = cellDate.getTime() < min.getTime();
          const isSel = cellDate.getTime() === selected.getTime();
          return (
            <Pressable
              key={i}
              testID={`cal-day-${d}`}
              disabled={disabled}
              onPress={() => {
                const nd = new Date(value);
                nd.setFullYear(year, month, d);
                onChange(nd);
              }}
              style={styles.cell}
            >
              <View style={[styles.dayInner, isSel && styles.daySel]}>
                <Text style={[styles.dayText, disabled && styles.dayDisabled, isSel && styles.daySelText]}>{d}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  navBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary },
  monthLabel: { color: colors.onSurface, fontSize: 15, fontFamily: font.semibold },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  dayInner: { width: "100%", height: "100%", maxWidth: 38, maxHeight: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySel: { backgroundColor: colors.brand },
  dayText: { color: colors.onSurface, fontSize: 14 },
  daySelText: { color: "#fff", fontWeight: "800" },
  dayDisabled: { color: colors.onSurfaceSecondary, opacity: 0.35 },
});
