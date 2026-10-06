import React, { useCallback, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors, spacing, radius, font } from "@/src/theme";
import { noticeCat } from "@/src/noticeCategories";

const KEY = "dismissedLoginNotices";

type Ann = {
  announcement_id: string;
  title: string;
  body: string;
  pinned?: boolean;
  author?: string;
  created_at: string;
  category?: string;
  urgent_until?: string | null;
};

const isUrgentActive = (a: Ann) =>
  (a.category || "") === "urgent" && (!a.urgent_until || new Date(a.urgent_until).getTime() > Date.now());

/** Shows the newest notice a member on this device hasn't yet opened, as a banner on
 * the login screen. Tapping opens the full notice (no login needed); dismissing it
 * remembers it so only genuinely new notices surface later. */
export default function LoginNoticeBanner() {
  const [anns, setAnns] = useState<Ann[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const raw = await storage.getItem(KEY, "");
    setDismissed(raw ? String(raw).split(",").filter(Boolean) : []);
    try {
      const r = await api.announcements();
      setAnns(r?.announcements || []);
    } catch {}
    setReady(true);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Urgent first, then newest. Pick the first one not already dismissed on this device.
  const ordered = [...anns].sort((a, b) => {
    const au = isUrgentActive(a) ? 0 : 1;
    const bu = isUrgentActive(b) ? 0 : 1;
    if (au !== bu) return au - bu;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const current = ordered.find((a) => !dismissed.includes(a.announcement_id));

  if (!ready || !current) return null;

  const dismiss = async () => {
    const next = [...dismissed, current.announcement_id];
    setOpen(false);
    setDismissed(next);
    await storage.setItem(KEY, next.join(","));
  };

  const cat = noticeCat(current.category);
  const urgent = isUrgentActive(current);
  const accent = urgent ? "#EF4444" : cat.color;

  return (
    <View style={styles.wrap}>
      <Pressable
        testID="login-notice-banner"
        onPress={() => setOpen(true)}
        style={[styles.banner, { borderColor: accent }, urgent && styles.bannerUrgent]}
      >
        <View style={[styles.iconWrap, { backgroundColor: accent }]}>
          <Ionicons name={(urgent ? "alert-circle" : cat.icon) as any} size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: accent }]}>
            {urgent ? "URGENT NOTICE" : `NEW ${cat.label.toUpperCase()} NOTICE`}
          </Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{current.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceSecondary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <Pressable style={styles.card} onPress={() => {}}>
            <View style={[styles.cardTag, { backgroundColor: accent }]}>
              <Ionicons name={(urgent ? "alert-circle" : cat.icon) as any} size={12} color="#fff" />
              <Text style={styles.cardTagText}>{urgent ? "URGENT" : cat.label.toUpperCase()}</Text>
            </View>
            <Text style={styles.cardTitle}>{current.title}</Text>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.cardBody}>{current.body}</Text>
              {!!current.author && <Text style={styles.cardAuthor}>— {current.author}</Text>}
            </ScrollView>
            <Pressable testID="login-notice-dismiss" onPress={dismiss} style={[styles.cardBtn, { backgroundColor: accent }]}>
              <Text style={styles.cardBtnText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginTop: -spacing.md, marginBottom: spacing.lg },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerUrgent: { backgroundColor: "rgba(239,68,68,0.09)", borderWidth: 2 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  kicker: { fontSize: 10, fontFamily: font.heading, letterSpacing: 1.2, marginBottom: 2 },
  bannerTitle: { color: colors.onSurface, fontSize: 14.5, fontFamily: font.semibold },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  cardTag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, marginBottom: spacing.md },
  cardTagText: { color: "#fff", fontSize: 10, fontFamily: font.heading, letterSpacing: 0.8 },
  cardTitle: { color: colors.onSurface, fontSize: 19, fontFamily: font.heading, marginBottom: spacing.sm },
  cardBody: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  cardAuthor: { color: colors.onSurfaceSecondary, fontSize: 13, fontStyle: "italic", marginTop: spacing.md },
  cardBtn: { marginTop: spacing.lg, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  cardBtnText: { color: "#fff", fontSize: 15, fontFamily: font.heading, letterSpacing: 0.5 },
});
