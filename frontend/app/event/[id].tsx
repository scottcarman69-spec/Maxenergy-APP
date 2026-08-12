import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import { classTime, classDate } from "@/src/datetime";

type Evt = {
  event_id: string;
  title: string;
  start_at: string;
  image: string;
  description: string;
  location: string;
};

function fmt(iso: string) {
  return `${classDate(iso, { weekday: "long", day: "2-digit", month: "long" })} · ${classTime(iso)}`;
}

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [evt, setEvt] = useState<Evt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setEvt(await api.eventDetail(id));
      api.trackEventView(id).catch(() => {});
    } catch (e: any) {
      setMsg(e?.message);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rsvp = async () => {
    if (!evt) return;
    setBusy(true);
    try {
      await api.rsvp(evt.event_id);
      setMsg("RSVP confirmed. We've sent you a confirmation email.");
    } catch (e: any) {
      setMsg(e?.message || "Could not RSVP");
    }
    setBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }
  if (!evt) return null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.hero}>
          <Image source={evt.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient
            colors={["rgba(18,18,20,0.55)", "transparent", "rgba(18,18,20,0.95)"]}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]}>
            <Pressable testID="event-back" onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroBottom}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateBadgeText}>{fmt(evt.start_at)}</Text>
            </View>
            <Text style={styles.title}>{evt.title}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Ionicons name="location" size={16} color={colors.brand} />
            <Text style={styles.metaText}>{evt.location}</Text>
          </View>
          <Text style={styles.desc}>{evt.description}</Text>
          {msg && <Text style={styles.msg}>{msg}</Text>}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="event-rsvp-button"
          style={({ pressed }) => [styles.rsvpBtn, pressed && { opacity: 0.85 }]}
          onPress={rsvp}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color={colors.onBrand} />
              <Text style={styles.rsvpText}>{"I'M GOING · NOTIFY ME"}</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 380, justifyContent: "flex-end" },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(18,18,20,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.lg,
    marginTop: spacing.md,
    position: "absolute",
  },
  heroBottom: { padding: spacing.xl },
  dateBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  dateBadgeText: { color: colors.onBrand, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  title: { color: colors.onSurface, fontSize: 34, fontWeight: "900", letterSpacing: -0.5 },
  body: { padding: spacing.xl, gap: spacing.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: colors.onSurface, fontSize: 14 },
  desc: { color: colors.onSurface, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  msg: { color: colors.brand, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 32 : spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rsvpBtn: {
    backgroundColor: colors.brand,
    paddingVertical: 16,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  rsvpText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
