import React, { useCallback, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api";
import { storage } from "@/src/utils/storage";
import { colors, spacing, radius, font } from "@/src/theme";
import { noticeCat } from "@/src/noticeCategories";

const KEY = "dismissedNotices";

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

/** After login (on the Home screen), auto-pops the newest notice this member hasn't
 * seen yet. "Got it" remembers it on this device so only genuinely new notices surface
 * later; "View all notices" opens the Notices tab. */
export default function HomeNoticePopup() {
  const router = useRouter();
  const [current, setCurrent] = useState<Ann | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    let dismissed: string[] = [];
    const raw = await storage.getItem(KEY, "");
    dismissed = raw ? String(raw).split(",").filter(Boolean) : [];
    let anns: Ann[] = [];
    try {
      const r = await api.announcements();
      anns = r?.announcements || [];
    } catch {}
    const ordered = [...anns].sort((a, b) => {
      const au = isUrgentActive(a) ? 0 : 1;
      const bu = isUrgentActive(b) ? 0 : 1;
      if (au !== bu) return au - bu;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    const next = ordered.find((a) => !dismissed.includes(a.announcement_id)) || null;
    if (next) {
      setCurrent(next);
      setOpen(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Only auto-check once per screen focus; don't re-pop while already showing.
      if (!open && !current) load();
    }, [load, open, current])
  );

  const dismiss = useCallback(async () => {
    setOpen(false);
    if (!current) return;
    const raw = await storage.getItem(KEY, "");
    const dismissed = raw ? String(raw).split(",").filter(Boolean) : [];
    if (!dismissed.includes(current.announcement_id)) {
      await storage.setItem(KEY, [...dismissed, current.announcement_id].join(","));
    }
  }, [current]);

  if (!current) return null;

  const cat = noticeCat(current.category);
  const urgent = isUrgentActive(current);
  const accent = urgent ? "#EF4444" : cat.color;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={styles.card} onPress={() => {}} testID="home-notice-popup">
          <View style={[styles.tag, { backgroundColor: accent }]}>
            <Ionicons name={(urgent ? "alert-circle" : cat.icon) as any} size={12} color="#fff" />
            <Text style={styles.tagText}>{urgent ? "URGENT" : cat.label.toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.body}>{current.body}</Text>
            {!!current.author && <Text style={styles.author}>— {current.author}</Text>}
          </ScrollView>
          <Pressable testID="home-notice-dismiss" onPress={dismiss} style={[styles.btn, { backgroundColor: accent }]}>
            <Text style={styles.btnText}>Got it</Text>
          </Pressable>
          <Pressable
            testID="home-notice-viewall"
            onPress={async () => { await dismiss(); router.push("/(tabs)/events"); }}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>View all notices</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 460, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  tag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, marginBottom: spacing.md },
  tagText: { color: "#fff", fontSize: 10, fontFamily: font.heading, letterSpacing: 0.8 },
  title: { color: colors.onSurface, fontSize: 20, fontFamily: font.heading, marginBottom: spacing.sm },
  body: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  author: { color: colors.onSurfaceSecondary, fontSize: 13, fontStyle: "italic", marginTop: spacing.md },
  btn: { marginTop: spacing.lg, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 15, fontFamily: font.heading, letterSpacing: 0.5 },
  linkBtn: { marginTop: spacing.sm, alignItems: "center", paddingVertical: 6 },
  linkText: { color: colors.onSurfaceSecondary, fontSize: 13.5, fontFamily: font.semibold },
});
