import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

export type Notice = {
  announcement_id: string;
  title: string;
  body: string;
  pinned?: boolean;
  created_at: string;
};

type Props = {
  visible: boolean;
  notices: Notice[];
  onClose: () => void;
  onViewAll: () => void;
};

export default function NoticePopup({ visible, notices, onClose, onViewAll }: Props) {
  const count = notices.length;
  if (count === 0) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconChip}>
              <Ionicons name="megaphone" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{count > 1 ? `${count} NEW NOTICES` : "NEW NOTICE"}</Text>
              <Text style={styles.headerTitle}>Fresh from the gym</Text>
            </View>
            <Pressable testID="notice-popup-close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {notices.map((n) => (
              <View key={n.announcement_id} style={styles.noticeItem}>
                <View style={styles.noticeTop}>
                  {n.pinned && (
                    <View style={styles.pinBadge}>
                      <Ionicons name="pin" size={11} color={colors.brand} />
                      <Text style={styles.pinText}>PINNED</Text>
                    </View>
                  )}
                  <Text style={styles.noticeTitle}>{n.title}</Text>
                </View>
                <Text style={styles.noticeBody}>{n.body}</Text>
              </View>
            ))}
          </ScrollView>

          <Pressable testID="notice-popup-viewall" style={styles.viewAllBtn} onPress={onViewAll}>
            <Ionicons name="newspaper-outline" size={18} color={colors.brand} />
            <Text style={styles.viewAllText}>OPEN NOTICES</Text>
          </Pressable>
          <Pressable testID="notice-popup-gotit" style={styles.gotItBtn} onPress={onClose}>
            <Text style={styles.gotItText}>GOT IT</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  iconChip: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.brand, fontSize: 11, fontFamily: font.heading, letterSpacing: 1.5 },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading, marginTop: 1 },
  noticeItem: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  noticeTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", marginBottom: 5 },
  pinBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brandTertiary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  pinText: { color: colors.brand, fontSize: 9, fontFamily: font.semibold, letterSpacing: 0.5 },
  noticeTitle: { color: colors.onSurface, fontSize: 15.5, fontFamily: font.heading, flexShrink: 1 },
  noticeBody: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 19 },
  viewAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: colors.brand, paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.md },
  viewAllText: { color: colors.brand, fontFamily: font.display, fontSize: 14, letterSpacing: 0.5 },
  gotItBtn: { alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.sm },
  gotItText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 0.6 },
});
