import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import { classTime, classDate } from "@/src/datetime";
import { coachSource } from "@/src/coaches";

type Booking = {
  booking_id: string;
  class_name: string;
  status: string;
  amount?: number;
  currency?: string;
  by_appointment?: boolean;
  scheduled_time?: string;
  attended?: boolean;
  class_start?: string;
  trainer?: string;
  trainer_photo?: string;
  duration_min?: number;
  level?: string;
};

function fmtDate(iso?: string) {
  if (!iso) return null;
  return classDate(iso, { weekday: "long", day: "2-digit", month: "long" });
}
function fmtTime(iso?: string) {
  if (!iso) return null;
  return classTime(iso);
}

export default function CheckIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ booking_id?: string }>();
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [qr, setQr] = useState<{ code: string; title: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const autoShown = React.useRef(false);

  const showQr = async (b: Booking) => {
    setQrLoading(true);
    try {
      const r = await api.checkinCode(b.booking_id);
      setQr({ code: r.code, title: b.class_name });
    } catch (e: any) {
      setBanner(e?.message || "Could not load your QR code.");
    }
    setQrLoading(false);
  };

  const load = useCallback(async () => {
    try {
      const r = await api.myBookings();
      const active = (r.bookings || []).filter((b: Booking) => b.status === "paid" || b.status === "confirmed");
      setRows(active);
      // If opened from a specific booking, pop its QR straight away.
      if (params.booking_id && !autoShown.current) {
        const match = active.find((b: Booking) => b.booking_id === params.booking_id);
        if (match) {
          autoShown.current = true;
          showQr(match);
        }
      }
    } catch {}
    setLoading(false);
  }, [params.booking_id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Class Check-In" backTestID="checkin-back" fallback="/(tabs)/profile" />

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
          <Text style={styles.intro}>Arriving for a class? Show your entry QR code to gym staff — they'll scan it to check you in.</Text>
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>You have no active bookings to check in to.</Text>
              <Pressable style={styles.link} onPress={() => router.navigate("/(tabs)/timetable")}>
                <Text style={styles.linkText}>Book a class</Text>
              </Pressable>
            </View>
          ) : (
            rows.map((b) => {
              const dateStr = b.by_appointment ? (b.scheduled_time || "Time to be confirmed") : (fmtDate(b.class_start) || "Date to be confirmed");
              const timeStr = b.by_appointment ? null : fmtTime(b.class_start);
              const avatar = coachSource(b.trainer, b.trainer_photo);
              return (
              <View key={b.booking_id} style={styles.card}>
                <View style={styles.cardTop}>
                  {avatar ? (
                    <Image source={avatar} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Ionicons name="barbell" size={22} color={colors.brand} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className}>{b.class_name}</Text>
                    {!!b.trainer && <Text style={styles.coach}>with {b.trainer}</Text>}
                  </View>
                  {b.attended ? (
                    <View style={styles.done}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.doneText}>Checked in</Text>
                    </View>
                  ) : (
                    <View style={styles.pending}>
                      <Ionicons name="qr-code-outline" size={13} color={colors.brand} />
                      <Text style={styles.pendingText}>Booked</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={15} color={colors.brand} />
                    <Text style={styles.detailText}>{dateStr}</Text>
                  </View>
                  {!!timeStr && (
                    <View style={styles.detailRow}>
                      <Ionicons name="time-outline" size={15} color={colors.brand} />
                      <Text style={styles.detailText}>
                        {timeStr}{b.duration_min ? ` · ${b.duration_min} min` : ""}
                      </Text>
                    </View>
                  )}
                  {!!b.level && (
                    <View style={styles.detailRow}>
                      <Ionicons name="ribbon-outline" size={15} color={colors.brand} />
                      <Text style={styles.detailText}>{b.level}</Text>
                    </View>
                  )}
                  <View style={styles.detailRow}>
                    <Ionicons name="pricetag-outline" size={15} color={colors.brand} />
                    <Text style={styles.detailText}>
                      {b.by_appointment ? "By appointment" : `$${((b.amount || 0) / 100).toFixed(0)} ${(b.currency || "AUD").toUpperCase()} · Paid`}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="bookmark-outline" size={15} color={colors.brand} />
                    <Text style={styles.detailText}>Ref: {b.booking_id.replace("bk_", "").toUpperCase().slice(0, 8)}</Text>
                  </View>
                </View>

                {!b.attended && (
                  <Pressable
                    testID={`show-qr-${b.booking_id}`}
                    style={styles.qrBtn}
                    onPress={() => showQr(b)}
                    disabled={qrLoading}
                  >
                    <Ionicons name="qr-code-outline" size={16} color={colors.brand} />
                    <Text style={styles.qrBtnText}>Show my entry QR</Text>
                  </Pressable>
                )}
              </View>
            );})
          )}
        </ScrollView>
      )}

      <Modal visible={!!qr} transparent animationType="fade" onRequestClose={() => setQr(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setQr(null)}>
          <Pressable style={styles.qrCard} onPress={() => {}}>
            <Text style={styles.qrTitle}>{qr?.title}</Text>
            <Text style={styles.qrSub}>Show this to gym staff to check in</Text>
            <View style={styles.qrBox}>
              {qr ? <QRCode value={qr.code} size={220} backgroundColor="#fff" color="#000" /> : null}
            </View>
            <View style={styles.qrHint}>
              <Ionicons name="information-circle-outline" size={15} color={colors.onSurfaceSecondary} />
              <Text style={styles.qrHintText}>Valid on your class day. Keep your screen bright.</Text>
            </View>
            <Pressable testID="qr-close" style={styles.qrCloseBtn} onPress={() => setQr(null)}>
              <Text style={styles.qrCloseText}>DONE</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  className: { color: colors.onSurface, fontWeight: "800", fontSize: 16 },
  coach: { color: colors.onSurfaceSecondary, fontSize: 12.5, marginTop: 2 },
  detailGrid: { gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailText: { color: colors.onSurface, fontSize: 13.5, fontWeight: "600", flex: 1 },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 11, borderRadius: radius.md },
  btnText: { color: colors.onBrand, fontWeight: "900", fontSize: 13 },
  pending: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill },
  pendingText: { color: colors.brand, fontWeight: "800", fontSize: 12 },
  done: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16A34A", paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md },
  doneText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  qrBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brand },
  qrBtnText: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  qrCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", width: "100%", maxWidth: 340, borderWidth: 1, borderColor: colors.border },
  qrTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900" },
  qrSub: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, marginBottom: spacing.lg },
  qrBox: { backgroundColor: "#fff", padding: 16, borderRadius: radius.md },
  qrHint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  qrHintText: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", flexShrink: 1 },
  qrCloseBtn: { backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, alignItems: "center", alignSelf: "stretch", marginTop: spacing.lg },
  qrCloseText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
  link: { paddingVertical: 8 },
  linkText: { color: colors.brand, fontWeight: "800", textDecorationLine: "underline" },
});
