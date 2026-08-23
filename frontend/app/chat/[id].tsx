import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import EmojiButton from "@/src/components/EmojiButton";

type DM = { dm_id: string; from_id: string; to_id: string; body: string; created_at: string; read?: boolean };

export default function FriendChat() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [msgs, setMsgs] = useState<DM[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [friendTyping, setFriendTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lenRef = useRef(0);
  const lastTypedRef = useRef(0);

  const apply = useCallback((r: any) => {
    const rows: DM[] = r.messages || [];
    setMsgs(rows);
    setFriendTyping(!!r.friend_typing);
    if (rows.length !== lenRef.current) {
      lenRef.current = rows.length;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([api.dmMessages(String(id)), api.me()]);
      apply(r);
      setMeId(me?.user?.user_id || "");
    } catch (e: any) { Alert.alert("Unavailable", e?.message || "Could not open chat."); }
    setLoading(false);
  }, [id]);

  const poll = useCallback(async () => {
    try { const r = await api.dmMessages(String(id)); apply(r); } catch {}
  }, [id]);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [load, poll]));

  const onType = (v: string) => {
    setText(v);
    const now = Date.now();
    if (now - lastTypedRef.current > 3000) {
      lastTypedRef.current = now;
      api.dmTyping(String(id)).catch(() => {});
    }
  };

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setSending(true); setText("");
    try { const r = await api.dmSend(String(id), body); setMsgs((m) => [...m, r.message]); lenRef.current += 1; setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }
    catch (e: any) { setText(body); Alert.alert("Not sent", e?.message || "Could not send message."); }
    setSending(false);
  };

  const moreMenu = () => {
    Alert.alert(String(name || "Friend"), "Manage this chat", [
      { text: "Block", style: "destructive", onPress: async () => { try { await api.friendBlock(String(id)); router.back(); } catch {} } },
      { text: "Report to gym", onPress: async () => { try { await api.friendReport(String(id), "Reported from chat"); Alert.alert("Thanks", "Report sent to the gym."); } catch {} } },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title={String(name || "Friend")} fallback="/(tabs)/inbox" right={<Pressable testID="friend-more" onPress={moreMenu} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={22} color={colors.onSurface} /></Pressable>} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 20 }}>
            {msgs.length === 0 ? (
              <View style={styles.empty}><Ionicons name="chatbubbles-outline" size={38} color={colors.onSurfaceSecondary} /><Text style={styles.emptyText}>Say hi to {name || "your friend"} 👋</Text></View>
            ) : msgs.map((m, i) => {
              const mine = m.from_id === meId;
              const isLastMine = mine && i === msgs.length - 1;
              return (
                <View key={m.dm_id} style={{ flexDirection: "row", justifyContent: mine ? "flex-end" : "flex-start" }}>
                  <View style={{ maxWidth: "82%", flexShrink: 1 }}>
                    <View style={[styles.bubble, mine ? styles.bubbleMe : styles.bubbleThem]}>
                      <Text style={[styles.msgText, mine && { color: colors.onBrand }]}>{m.body}</Text>
                    </View>
                    {isLastMine && (
                      <Text style={styles.receipt}>{m.read ? "Seen" : "Sent"}</Text>
                    )}
                  </View>
                </View>
              );
            })}
            {friendTyping && (
              <View style={[styles.bubble, styles.bubbleThem, styles.typingBubble]} testID="dm-typing">
                <Text style={styles.typingText}>{name || "Friend"} is typing…</Text>
              </View>
            )}
          </ScrollView>
        )}
        <View style={styles.inputBar}>
          <EmojiButton testID="dm-emoji" onPick={(e) => setText((t) => t + e)} />
          <TextInput testID="dm-input" value={text} onChangeText={onType} placeholder="Type a message…" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} multiline />
          <Pressable testID="dm-send" style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()}>
            {sending ? <ActivityIndicator size="small" color={colors.onBrand} /> : <Ionicons name="send" size={18} color={colors.onBrand} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 20 },
  bubble: { padding: spacing.md, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  msgText: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  receipt: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "700", alignSelf: "flex-end", marginTop: 3, marginRight: 2 },
  typingBubble: { alignSelf: "flex-start", paddingVertical: 8 },
  typingText: { color: colors.onSurfaceSecondary, fontSize: 13, fontStyle: "italic" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
