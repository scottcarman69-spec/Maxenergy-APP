import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView, Pressable, Modal } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

const TIMES: string[] = [];
for (let h = 0; h < 24; h++) for (const m of [0, 30]) TIMES.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
function fmt12(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

export default function InboxSettings() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [remHours, setRemHours] = useState(3);
  const [qhEnabled, setQhEnabled] = useState(false);
  const [qhStart, setQhStart] = useState("22:00");
  const [qhEnd, setQhEnd] = useState("07:00");
  const [lbHidden, setLbHidden] = useState(false);
  const [picker, setPicker] = useState<null | "start" | "end">(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      setEnabled(me?.user?.message_notifications !== false);
      setRemHours(typeof me?.user?.reminder_hours === "number" ? me.user.reminder_hours : 3);
      const qh = me?.user?.quiet_hours;
      if (qh) { setQhEnabled(!!qh.enabled); setQhStart(qh.start || "22:00"); setQhEnd(qh.end || "07:00"); }
      setLbHidden(me?.user?.leaderboard_opt_out === true);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleLeaderboard = async (hide: boolean) => {
    setLbHidden(hide);
    try { await api.setLeaderboardVisibility(hide); }
    catch { setLbHidden(!hide); }
  };

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

  const saveQuiet = async (next: { enabled?: boolean; start?: string; end?: string }) => {
    const payload = { enabled: next.enabled ?? qhEnabled, start: next.start ?? qhStart, end: next.end ?? qhEnd };
    setQhEnabled(payload.enabled); setQhStart(payload.start); setQhEnd(payload.end);
    try { await api.setQuietHours(payload); } catch {}
  };

  const remOn = remHours > 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Notifications & Reminders" fallback="/(tabs)/inbox" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Pressable testID="settings-view-notifications" style={styles.linkCard} onPress={() => router.push("/notifications")}>
            <View style={styles.iconWrap}><Ionicons name="notifications" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>My notifications</Text>
              <Text style={styles.sub}>View all your alerts, messages and reminders.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </Pressable>

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

          <Text style={[styles.section, { marginTop: spacing.lg }]}>ATTENDANCE LADDER</Text>
          <View style={styles.card}>
            <View style={styles.iconWrap}><Ionicons name="trophy" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Hide me from the public ladder</Text>
              <Text style={styles.sub}>Your attendance is still counted — your name just won't appear to others.</Text>
            </View>
            <Switch
              testID="toggle-leaderboard-hidden"
              value={lbHidden}
              onValueChange={toggleLeaderboard}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={"#fff"}
            />
          </View>

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

          <Text style={[styles.section, { marginTop: spacing.lg }]}>QUIET HOURS</Text>
          <View style={styles.card}>
            <View style={styles.iconWrap}><Ionicons name="moon" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Quiet hours</Text>
              <Text style={styles.sub}>Mute all notifications overnight or during set hours.</Text>
            </View>
            <Switch
              testID="toggle-quiet-hours"
              value={qhEnabled}
              onValueChange={(val) => saveQuiet({ enabled: val })}
              trackColor={{ false: colors.border, true: colors.brand }}
              thumbColor={"#fff"}
            />
          </View>
          {qhEnabled && (
            <View style={styles.timeRow}>
              <Pressable testID="quiet-start" style={styles.timeBtn} onPress={() => setPicker("start")}>
                <Text style={styles.timeLabel}>From</Text>
                <Text style={styles.timeVal}>{fmt12(qhStart)}</Text>
              </Pressable>
              <Ionicons name="arrow-forward" size={16} color={colors.onSurfaceSecondary} />
              <Pressable testID="quiet-end" style={styles.timeBtn} onPress={() => setPicker("end")}>
                <Text style={styles.timeLabel}>Until</Text>
                <Text style={styles.timeVal}>{fmt12(qhEnd)}</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.note}>
            {qhEnabled
              ? `Notifications are muted from ${fmt12(qhStart)} to ${fmt12(qhEnd)} (Queensland time). They'll still be waiting in your Inbox.`
              : "Quiet hours are off. Turn on to silence alerts during set hours."}
          </Text>
        </ScrollView>
      )}

      <Modal visible={picker !== null} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{picker === "start" ? "Mute from" : "Mute until"}</Text>
            <ScrollView style={{ maxHeight: 340 }}>
              {TIMES.map((t) => {
                const sel = (picker === "start" ? qhStart : qhEnd) === t;
                return (
                  <Pressable key={t} testID={`quiet-opt-${t}`} style={[styles.opt, sel && styles.optOn]}
                    onPress={() => { saveQuiet(picker === "start" ? { start: t } : { end: t }); setPicker(null); }}>
                    <Text style={[styles.optText, sel && styles.optTextOn]}>{fmt12(t)}</Text>
                    {sel && <Ionicons name="checkmark" size={18} color={colors.brand} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  section: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  linkCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.lg, padding: spacing.md },
  iconWrap: { width: 42, height: 42, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  title: { color: colors.onSurface, fontSize: 15.5, fontWeight: "800" },
  sub: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  note: { color: colors.onSurfaceSecondary, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 4 },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.surfaceSecondary },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
  chipTextOn: { color: colors.brand },
  timeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  timeBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", gap: 2 },
  timeLabel: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  timeVal: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "#00000099", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: 32 },
  sheetTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "900", marginBottom: spacing.sm, textAlign: "center" },
  opt: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: spacing.md, borderRadius: radius.md },
  optOn: { backgroundColor: colors.brandTertiary },
  optText: { color: colors.onSurface, fontSize: 15 },
  optTextOn: { color: colors.brand, fontWeight: "900" },
});
