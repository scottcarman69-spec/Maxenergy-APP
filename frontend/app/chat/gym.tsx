import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import EmojiButton from "@/src/components/EmojiButton";

type Msg = { message_id: string; body: string; sender_is_admin: boolean; sender_name: string; created_at: string };

export default function GymChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try { const r = await api.myMessages(); setMsgs(r.messages || []); } catch {}
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    const body = text.trim(); if (!body) return;
    setSending(true); setText("");
    try { const r = await api.sendMessage(body); setMsgs((m) => [...m, r.message]); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }
    catch { setText(body); }
    setSending(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Maxenergy Team" fallback="/(tabs)/inbox" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 20 }}>
            {msgs.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="chatbubbles-outline" size={40} color={colors.onSurfaceSecondary} />
                <Text style={styles.emptyText}>Have a question or an issue? Send us a message and the Maxenergy Team will get back to you here.</Text>
              </View>
            ) : msgs.map((m) => (
              <View key={m.message_id} style={{ flexDirection: "row", justifyContent: m.sender_is_admin ? "flex-start" : "flex-end" }}>
                <View style={[styles.bubble, m.sender_is_admin ? styles.bubbleThem : styles.bubbleMe]}>
                  {m.sender_is_admin && <Text style={styles.sender}>Maxenergy Team</Text>}
                  <Text style={[styles.msgText, !m.sender_is_admin && { color: colors.onBrand }]}>{m.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.inputBar}>
          <EmojiButton testID="msg-emoji" onPick={(e) => setText((t) => t + e)} />
          <TextInput testID="msg-input" value={text} onChangeText={setText} placeholder="Type a message…" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} multiline />
          <Pressable testID="msg-send" style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()}>
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
  bubble: { maxWidth: "82%", flexShrink: 1, padding: spacing.md, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { color: colors.brand, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  msgText: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
