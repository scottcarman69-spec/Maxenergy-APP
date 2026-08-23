import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

// One-time, non-dismissable date-of-birth prompt for accounts without a DOB
// (e.g. Google/Apple social sign-ins). Ensures the 13+ messaging rule applies
// to everyone. Only rendered when the signed-in user has needs_dob === true.
export default function DobGateModal() {
  const { user, refresh } = useAuth();
  const now = new Date();
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const years = useMemo(() => Array.from({ length: 116 }, (_, i) => now.getFullYear() - i), []);
  const daysInMonth = month && year ? new Date(year, month, 0).getDate() : 31;
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const complete = day !== null && month !== null && year !== null;
  const label = complete ? `${pad(day!)} ${MONTHS[month! - 1]} ${year}` : "";

  const visible = !!user && user.needs_dob === true;

  const save = async () => {
    if (!complete) return;
    setErr(null);
    setSaving(true);
    try {
      await api.setDateOfBirth(`${year}-${pad(month!)}-${pad(day!)}`);
      await refresh();
    } catch (e: any) {
      setErr(e?.message || "Couldn't save your date of birth. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="gift-outline" size={26} color={colors.brand} />
          </View>
          <Text style={styles.title}>One quick thing</Text>
          <Text style={styles.body}>
            Please confirm your date of birth. We ask this once to keep the community safe and
            age-appropriate.
          </Text>

          <View style={styles.wheels}>
            <Wheel label="Day" data={days} selected={day} render={(v) => pad(v)} onSelect={setDay} testPrefix="dobg-day" />
            <Wheel
              label="Month"
              data={Array.from({ length: 12 }, (_, i) => i + 1)}
              selected={month}
              render={(v) => MONTHS[v - 1]}
              onSelect={(v) => { setMonth(v); if (day && day > new Date(year || 2000, v, 0).getDate()) setDay(null); }}
              testPrefix="dobg-month"
            />
            <Wheel label="Year" data={years} selected={year} render={(v) => String(v)} onSelect={setYear} testPrefix="dobg-year" />
          </View>

          {err && <Text style={styles.error}>{err}</Text>}

          <Pressable
            testID="dobg-confirm"
            style={[styles.btn, (!complete || saving) && { opacity: 0.5 }]}
            disabled={!complete || saving}
            onPress={save}
          >
            {saving ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text style={styles.btnText}>{complete ? `CONFIRM · ${label}` : "SELECT DATE"}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Wheel({
  label, data, selected, render, onSelect, testPrefix,
}: {
  label: string; data: number[]; selected: number | null; render: (v: number) => string; onSelect: (v: number) => void; testPrefix: string;
}) {
  return (
    <View style={styles.wheelCol}>
      <Text style={styles.wheelLabel}>{label}</Text>
      <ScrollView style={styles.wheelScroll} showsVerticalScrollIndicator={false}>
        {data.map((v) => {
          const active = selected === v;
          return (
            <Pressable key={v} testID={`${testPrefix}-${v}`} style={[styles.wheelItem, active && styles.wheelItemActive]} onPress={() => onSelect(v)}>
              <Text style={[styles.wheelItemText, active && styles.wheelItemTextActive]}>{render(v)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  title: { color: colors.onSurface, fontSize: 22, fontWeight: "900" },
  body: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: spacing.lg },
  wheels: { flexDirection: "row", gap: spacing.md, height: 220 },
  wheelCol: { flex: 1 },
  wheelLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1, textAlign: "center", marginBottom: 6 },
  wheelScroll: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  wheelItem: { paddingVertical: 11, alignItems: "center" },
  wheelItemActive: { backgroundColor: colors.brand },
  wheelItemText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  wheelItemTextActive: { color: colors.onBrand, fontWeight: "900" },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  btn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  btnText: { color: colors.onBrand, fontWeight: "800", letterSpacing: 1 },
});
