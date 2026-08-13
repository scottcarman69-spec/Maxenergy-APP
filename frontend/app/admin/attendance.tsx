import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Person = { name: string; email?: string; checkin_time?: string | null; checked_in_by?: string | null };
type Session = { class_name: string; iso: string; date: string; time: string; attended: Person[]; no_shows: Person[]; attended_count: number; no_show_count: number; booked_count: number };
type Roster = { sessions: Session[]; totals: { attended: number; no_shows: number; sessions: number } };

const csvCell = (v: any) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Report = {
  totals: { today: number; week: number; month: number; all: number };
  daily: { date: string; iso: string; count: number }[];
  by_class: { name: string; count: number }[];
  top_members: { name: string; email?: string; count: number }[];
  recent: { name: string; email?: string; class_name: string; date: string; time: string; by: string }[];
  sessions: { class_name: string; iso: string; date: string; count: number; attendees: { name: string; email?: string; time: string; by: string }[] }[];
};

export default function AdminAttendance() {
  const router = useRouter();
  const [data, setData] = useState<Report | null>(null);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openNs, setOpenNs] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, rr] = await Promise.all([api.attendanceReport(), api.attendanceRoster()]);
      setData(r);
      setRoster(rr);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const exportCsv = useCallback(async () => {
    if (!roster || !roster.sessions.length || exporting) return;
    setExporting(true);
    try {
      const headers = ["Class", "Date", "Time", "Member", "Email", "Status", "Check-in time", "Checked in by"];
      const lines = [headers.join(",")];
      for (const s of roster.sessions) {
        const rows: [Person, string][] = [
          ...s.attended.map((p) => [p, "Attended"] as [Person, string]),
          ...s.no_shows.map((p) => [p, "No-show"] as [Person, string]),
        ];
        for (const [p, status] of rows) {
          const by = p.checked_in_by === "admin_qr" ? "QR scan" : p.checked_in_by === "admin" ? "Staff" : p.checked_in_by === "member" ? "Member" : "";
          lines.push([
            csvCell(s.class_name), csvCell(s.date), csvCell(s.time),
            csvCell(p.name), csvCell(p.email), csvCell(status),
            csvCell(p.checkin_time || ""), csvCell(by),
          ].join(","));
        }
      }
      const csv = lines.join("\n");
      const fname = `maxenergy-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fname; document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
      } else {
        const uri = FileSystem.cacheDirectory + fname;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export attendance", UTI: "public.comma-separated-values-text" });
        } else {
          Alert.alert("Export ready", `Saved attendance to ${fname}.`);
        }
      }
    } catch (e: any) {
      Alert.alert("Export failed", e?.message || "Could not export attendance.");
    }
    setExporting(false);
  }, [roster, exporting]);

  const maxDaily = Math.max(1, ...(data?.daily || []).map((d) => d.count));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Attendance Report"
        backTestID="att-back"
        fallback="/admin"
        right={
          <Pressable testID="att-scan" onPress={() => router.push("/admin/scan")} hitSlop={12}>
            <Ionicons name="qr-code-outline" size={24} color={colors.brand} />
          </Pressable>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : !data ? (
        <Text style={styles.empty}>Could not load report.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 40 }}>
          <Pressable testID="att-export" style={[styles.exportBtn, exporting && { opacity: 0.6 }]} onPress={exportCsv} disabled={exporting || !roster?.sessions.length}>
            {exporting ? <ActivityIndicator color={colors.brand} /> : (
              <>
                <Ionicons name="download-outline" size={18} color={colors.brand} />
                <Text style={styles.exportText}>EXPORT ATTENDANCE (CSV)</Text>
              </>
            )}
          </Pressable>

          <View style={styles.statsGrid}>
            {[
              { label: "TODAY", value: data.totals.today },
              { label: "THIS WEEK", value: data.totals.week },
              { label: "THIS MONTH", value: data.totals.month },
              { label: "ALL TIME", value: data.totals.all },
            ].map((s) => (
              <View key={s.label} style={styles.statBox}>
                <Text style={styles.statNum}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>LAST 14 DAYS</Text>
            <View style={styles.chart}>
              {data.daily.map((d) => (
                <View key={d.iso} style={styles.barCol}>
                  <Text style={styles.barVal}>{d.count > 0 ? d.count : ""}</Text>
                  <View style={[styles.bar, { height: Math.max(4, (d.count / maxDaily) * 120) }]} />
                  <Text style={styles.barLabel}>{d.date.split(" ")[1]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>WHO ATTENDED EACH CLASS</Text>
            {(!data.sessions || data.sessions.length === 0) ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.sessions.map((s) => {
                const key = s.class_name + s.iso;
                const open = openKey === key;
                return (
                  <View key={key} style={styles.session}>
                    <Pressable
                      testID={`session-${key}`}
                      style={styles.sessionHead}
                      onPress={() => setOpenKey(open ? null : key)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName} numberOfLines={1}>{s.class_name}</Text>
                        <Text style={styles.rowEmail}>{s.date}</Text>
                      </View>
                      <View style={styles.countPill}>
                        <Ionicons name="people" size={13} color={colors.brand} />
                        <Text style={styles.countPillText}>{s.count}</Text>
                      </View>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceSecondary} />
                    </Pressable>
                    {open && (
                      <View style={styles.attendeeList}>
                        {s.attendees.map((a, i) => (
                          <View key={i} style={styles.attendeeRow}>
                            <Ionicons name="person-circle-outline" size={18} color={colors.brand} />
                            <Text style={styles.attendeeName} numberOfLines={1}>{a.name}</Text>
                            <Text style={styles.attendeeTime}>{a.time}{a.by === "admin_qr" ? " · QR" : a.by === "admin" ? " · staff" : ""}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>NO-SHOW REPORT</Text>
            <View style={styles.nsSummary}>
              <View style={[styles.nsChip, { borderColor: "#22C55E" }]}>
                <Text style={[styles.nsChipNum, { color: "#22C55E" }]}>{roster?.totals.attended ?? 0}</Text>
                <Text style={styles.nsChipLabel}>ATTENDED</Text>
              </View>
              <View style={[styles.nsChip, { borderColor: colors.error }]}>
                <Text style={[styles.nsChipNum, { color: colors.error }]}>{roster?.totals.no_shows ?? 0}</Text>
                <Text style={styles.nsChipLabel}>NO-SHOWS</Text>
              </View>
              <View style={[styles.nsChip, { borderColor: colors.border }]}>
                <Text style={[styles.nsChipNum, { color: colors.onSurface }]}>{roster?.totals.sessions ?? 0}</Text>
                <Text style={styles.nsChipLabel}>SESSIONS</Text>
              </View>
            </View>
            {(!roster || roster.sessions.length === 0) ? (
              <Text style={styles.muted}>No ended sessions yet.</Text>
            ) : (
              roster.sessions.filter((s) => s.no_show_count > 0).length === 0 ? (
                <Text style={styles.muted}>🎉 No no-shows — every booked member checked in.</Text>
              ) : (
                roster.sessions.filter((s) => s.no_show_count > 0).map((s) => {
                  const key = "ns" + s.class_name + s.iso;
                  const open = openNs === key;
                  return (
                    <View key={key} style={styles.session}>
                      <Pressable testID={`noshow-${key}`} style={styles.sessionHead} onPress={() => setOpenNs(open ? null : key)}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowName} numberOfLines={1}>{s.class_name}</Text>
                          <Text style={styles.rowEmail}>{s.date} · {s.time}</Text>
                        </View>
                        <View style={[styles.countPill, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                          <Ionicons name="alert-circle" size={13} color={colors.error} />
                          <Text style={[styles.countPillText, { color: colors.error }]}>{s.no_show_count}</Text>
                        </View>
                        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.onSurfaceSecondary} />
                      </Pressable>
                      {open && (
                        <View style={styles.attendeeList}>
                          <Text style={styles.nsMeta}>{s.attended_count} of {s.booked_count} checked in · {s.no_show_count} missed</Text>
                          {s.no_shows.map((p, i) => (
                            <View key={i} style={styles.attendeeRow}>
                              <Ionicons name="close-circle-outline" size={18} color={colors.error} />
                              <Text style={styles.attendeeName} numberOfLines={1}>{p.name}</Text>
                              <Text style={styles.attendeeTime} numberOfLines={1}>{p.email || ""}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>BY CLASS</Text>
            {data.by_class.length === 0 ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.by_class.map((c) => (
                <View key={c.name} style={styles.row}>
                  <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.rowCount}>{c.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>MOST ACTIVE MEMBERS</Text>
            {data.top_members.length === 0 ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.top_members.map((m, i) => (
                <View key={(m.email || "") + i} style={styles.row}>
                  <Text style={styles.rowRank}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{m.name}</Text>
                    {!!m.email && <Text style={styles.rowEmail} numberOfLines={1}>{m.email}</Text>}
                  </View>
                  <Text style={styles.rowCount}>{m.count}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>RECENT CHECK-INS</Text>
            {(!data.recent || data.recent.length === 0) ? (
              <Text style={styles.muted}>No check-ins yet.</Text>
            ) : (
              data.recent.map((c, i) => (
                <View key={i} style={styles.checkinRow}>
                  <View style={styles.checkinDot}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.rowEmail} numberOfLines={1}>{c.class_name}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.ciDate}>{c.date}</Text>
                    <Text style={styles.ciTime}>{c.time}{c.by === "admin" ? " · by staff" : ""}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  empty: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: 40 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  statBox: { width: "47%", flexGrow: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, alignItems: "center", borderWidth: 1, borderColor: colors.border },
  statNum: { color: colors.brand, fontSize: 30, fontFamily: font.display },
  statLabel: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1, fontWeight: "800", marginTop: 2 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1, fontWeight: "900", marginBottom: spacing.sm },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 160, gap: 2 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 },
  bar: { width: "70%", backgroundColor: colors.brand, borderRadius: 3 },
  barVal: { color: colors.onSurface, fontSize: 9, fontWeight: "800" },
  barLabel: { color: colors.onSurfaceSecondary, fontSize: 9 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  rowRank: { color: colors.brand, fontWeight: "900", width: 20, fontSize: 15 },
  rowName: { color: colors.onSurface, fontWeight: "700", fontSize: 14, flex: 1 },
  rowEmail: { color: colors.onSurfaceSecondary, fontSize: 11 },
  rowCount: { color: colors.brand, fontWeight: "900", fontSize: 16 },
  muted: { color: colors.onSurfaceSecondary, fontSize: 13, paddingVertical: 6 },
  checkinRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  checkinDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  ciDate: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  ciTime: { color: colors.onSurfaceSecondary, fontSize: 11, marginTop: 1 },
  session: { borderTopWidth: 1, borderTopColor: colors.border },
  sessionHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 12 },
  countPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  countPillText: { color: colors.brand, fontWeight: "900", fontSize: 13 },
  attendeeList: { paddingBottom: spacing.md, paddingLeft: spacing.sm, gap: 8 },
  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  attendeeName: { color: colors.onSurface, fontSize: 13.5, fontWeight: "600", flex: 1 },
  attendeeTime: { color: colors.onSurfaceSecondary, fontSize: 11.5 },
  exportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand },
  exportText: { color: colors.brand, fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
  nsSummary: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  nsChip: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  nsChipNum: { fontSize: 24, fontWeight: "900" },
  nsChipLabel: { color: colors.onSurfaceSecondary, fontSize: 9.5, letterSpacing: 0.8, fontWeight: "800", marginTop: 2 },
  nsMeta: { color: colors.onSurfaceSecondary, fontSize: 11.5, fontStyle: "italic", marginBottom: 2 },
});
