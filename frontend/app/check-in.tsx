import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  by_appointment?: boolean;
  scheduled_time?: string;
  attended?: boolean;
};

export default function CheckIn() {
  const router = useRouter();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.myBookings();
      setRows((r.bookings || []).filter((b: Booking) => b.status === "paid" || b.status === "confirmed"));
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const checkin = async (b: Booking) => {
    setBusy(b.booking_id);
    try {
      await api.checkinBooking(b.booking_id);
      setBanner(`✅ Checked in to ${b.class_name}. Have a great session!`);
      await load();
    } catch (e: any) {
      setBanner(e?.message || "Could not check in.");
    }
    setBusy(null);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="checkin-back" onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Class Check-In</Text>
        <View style={{ width: 26 }} />
      </View>

      {banner && (
        <Pressable onPress={() => setBanner(null)} style={styles.banner}>
          <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
          <Text style={styles.bannerText}>{banner}</Text>
        </Pressable>
      )}

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 40 }}>
          <Text style={styles.intro}>Arriving for a class? Tap check in below so we can mark your attendance.</Text>
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>You have no active bookings to check in to.</Text>
              <Pressable style={styles.link} onPress={() => router.push("/(tabs)/timetable")}>
                <Text style={styles.linkText}>Book a class</Text>
              </Pressable>
            </View>
          ) : (
            rows.map((b) => (
              <View key={b.booking_id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.className}>{b.class_name}</Text>
                  <Text style={styles.meta}>
                    {b.by_appointment ? "By appointment" : "Booked class"}
                    {b.scheduled_time ? ` · ${b.scheduled_time}` : ""}
                  </Text>
                </View>
                {b.attended ? (
                  <View style={styles.done}>
                    <Ionicons name="checkmark-circle" size={18} color="#fff" />
                    <Text style={styles.doneText}>Checked in</Text>
                  </View>
                ) : (
                  <Pressable
                    testID={`checkin-btn-${b.booking_id}`}
                    style={styles.btn}
                    onPress={() => checkin(b)}
                    disabled={busy === b.booking_id}
                  >
                    {busy === b.booking_id ? (
                      <ActivityIndicator size="small" color={colors.onBrand} />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={16} color={colors.onBrand} />
                        <Text style={styles.btnText}>Check in</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  banner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  bannerText: { color: colors.brand, fontSize: 13, fontWeight: "700", flex: 1 },
  intro: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  className: { color: colors.onSurface, fontWeight: "800", fontSize: 15 },
  meta: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 3 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.md },
  btnText: { color: colors.onBrand, fontWeight: "900", fontSize: 13 },
  done: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16A34A", paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.md },
  doneText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
  link: { paddingVertical: 8 },
  linkText: { color: colors.brand, fontWeight: "800", textDecorationLine: "underline" },
});
