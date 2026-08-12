import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import EmojiButton from "@/src/components/EmojiButton";

type GM = { gmsg_id: string; from_id: string; sender_name: string; body: string; created_at: string };

function shortName(full?: string): string {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export default function GroupChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [msgs, setMsgs] = useState<GM[]>([]);
  const [gname, setGname] = useState(String(name || "Group"));
  const [count, setCount] = useState(0);
  const [pinned, setPinned] = useState<string | null>(null);
  const [pinExpanded, setPinExpanded] = useState(false);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);
  const ref = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([api.groupGet(String(id)), api.me()]);
      setMsgs(r.messages || []); setGname(r.group?.name || gname); setCount((r.group?.members || []).length);
      setPinned(r.group?.pinned_note || null);
      setMeId(me?.user?.user_id || "");
    } catch {
      // Not a member (e.g. tapped the Academy shortcut without joining).
      setDenied(true);
      setLoading(false);
      return;
    }
    setLoading(false);
    setTimeout(() => ref.current?.scrollToEnd({ animated: false }), 100);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setSending(true); setText("");
    try { const r = await api.groupSend(String(id), body); setMsgs((m) => [...m, r.message]); setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 100); }
    catch { setText(body); }
    setSending(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title={denied ? "Members only" : gname} subtitle={denied ? undefined : `${count} members`} fallback="/(tabs)/inbox"
        right={denied ? undefined :
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable testID="group-members" hitSlop={10} onPress={() => router.push({ pathname: "/group/members", params: { id: String(id) } } as any)}><Ionicons name="people" size={22} color={colors.onSurface} /></Pressable>
            <Pressable testID="group-manage" hitSlop={10} onPress={() => router.push({ pathname: "/group/manage", params: { id: String(id) } } as any)}><Ionicons name="settings-outline" size={22} color={colors.onSurface} /></Pressable>
          </View>
        } />
      {denied ? (
        <View style={styles.denied} testID="group-denied">
          <Ionicons name="lock-closed" size={44} color={colors.onSurfaceSecondary} />
          <Text style={styles.deniedTitle}>Only group members can access this group</Text>
          <Text style={styles.deniedSub}>Head to your Inbox to request to join, then an admin can add you.</Text>
          <Pressable testID="group-denied-inbox" style={styles.deniedBtn} onPress={() => router.replace("/(tabs)/inbox")}>
            <Text style={styles.deniedBtnText}>Go to Inbox</Text>
          </Pressable>
        </View>
      ) : (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        {!!pinned && (
          <Pressable style={styles.pinBar} onPress={() => setPinExpanded((v) => !v)}>
            <Ionicons name="pin" size={16} color={colors.brand} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pinTitle}>PINNED · GROUP RULES</Text>
              <Text style={styles.pinBody} numberOfLines={pinExpanded ? undefined : 2}>{pinned}</Text>
              <Text style={styles.pinToggle}>{pinExpanded ? "Show less" : "Read more"}</Text>
            </View>
          </Pressable>
        )}
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={ref} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 20 }}>
            {msgs.length === 0 ? (
              <View style={styles.empty}><Ionicons name="people-outline" size={38} color={colors.onSurfaceSecondary} /><Text style={styles.emptyText}>Start the conversation with your crew 🥊</Text></View>
            ) : msgs.map((m) => {
              const mine = m.from_id === meId;
              if (m.from_id === "system") {
                return (
                  <View key={m.gmsg_id} style={styles.announce}>
                    <View style={styles.announceHead}>
                      <Ionicons name="megaphone" size={14} color={colors.brand} />
                      <Text style={styles.announceLabel}>GYM ANNOUNCEMENT</Text>
                    </View>
                    <Text style={styles.announceBody}>{m.body}</Text>
                  </View>
                );
              }
              return (
                <View key={m.gmsg_id} style={[styles.bubble, mine ? styles.me : styles.them]}>
                  {!mine && <Text style={styles.sender}>{shortName(m.sender_name)}</Text>}
                  <Text style={[styles.msg, mine && { color: colors.onBrand }]}>{m.body}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.bar}>
          <EmojiButton testID="group-emoji" onPick={(e) => setText((t) => t + e)} />
          <TextInput testID="group-input" value={text} onChangeText={setText} placeholder="Message the group…" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} multiline />
          <Pressable testID="group-send" style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()}>
            {sending ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="send" size={18} color={colors.onBrand} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
  denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: spacing.md },
  deniedTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900", textAlign: "center" },
  deniedSub: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  deniedBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 13, marginTop: spacing.sm },
  deniedBtnText: { color: colors.onBrand, fontWeight: "900", fontSize: 15 },
  pinBar: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.brandTertiary, borderBottomWidth: 1, borderBottomColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 10 },
  pinTitle: { color: colors.brand, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  pinBody: { color: colors.onSurface, fontSize: 13, lineHeight: 18, marginTop: 3 },
  pinToggle: { color: colors.brand, fontSize: 11.5, fontWeight: "800", marginTop: 4 },
  bubble: { maxWidth: "82%", padding: spacing.md, borderRadius: radius.lg },
  me: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  them: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { color: colors.brand, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  announce: { alignSelf: "stretch", backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.lg, padding: spacing.md, gap: 5 },
  announceHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  announceLabel: { color: colors.brand, fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  announceBody: { color: colors.onSurface, fontSize: 14.5, lineHeight: 20 },
  msg: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  bar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
