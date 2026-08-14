import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";

export type AlertItem = {
  notification_id: string;
  title: string;
  body: string;
  created_at: string;
  nav?: string;
  data?: { user_id?: string; name?: string; class_id?: string };
};

type Props = {
  visible: boolean;
  items: AlertItem[];
  onClose: () => void;
  onViewAll: () => void;
  onOpen: (item: AlertItem) => void;
};

export default function AlertPopup({ visible, items, onClose, onViewAll, onOpen }: Props) {
  const count = items.length;
  if (count === 0) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconChip}>
              <Ionicons name="notifications" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Notifications</Text>
            </View>
            <Pressable testID="alert-popup-close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
            {items.map((n) => (
              <Pressable
                key={n.notification_id}
                testID={`alert-popup-item-${n.notification_id}`}
                style={styles.item}
                onPress={() => onOpen(n)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{n.title}</Text>
                  {!!n.body && <Text style={styles.itemBody}>{n.body}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.brand} />
              </Pressable>
            ))}
          </ScrollView>

          <Pressable testID="alert-popup-viewall" style={styles.viewAllBtn} onPress={onViewAll}>
            <Ionicons name="open-outline" size={18} color={colors.onBrand} />
            <Text style={styles.viewAllText}>VIEW NOTIFICATIONS</Text>
          </Pressable>
          <Pressable testID="alert-popup-gotit" style={styles.gotItBtn} onPress={onClose}>
            <Text style={styles.gotItText}>DISMISS</Text>
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
  headerTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading, marginTop: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  itemTitle: { color: colors.onSurface, fontSize: 15, fontFamily: font.heading, marginBottom: 3 },
  itemBody: { color: colors.onSurfaceSecondary, fontSize: 13.5, lineHeight: 19 },
  viewAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.md },
  viewAllText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 0.5 },
  gotItBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  gotItText: { color: colors.onSurfaceSecondary, fontFamily: font.display, fontSize: 14, letterSpacing: 0.6 },
});
