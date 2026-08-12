import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type GM = { gmsg_id: string; from_id: string; sender_name: string; body: string; created_at: string };

export default function GroupChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [msgs, setMsgs] = useState<GM[]>([]);
  const [gname, setGname] = useState(String(name || "Group"));
  const [count, setCount] = useState(0);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([api.groupGet(String(id)), api.me()]);
      setMsgs(r.messages || []); setGname(r.group?.name || gname); setCount((r.group?.members || []).length);
      setMeId(me?.user?.user_id || "");
    } catch {}
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
      <ScreenHeader title={gname} subtitle={`${count} members`} fallback="/(tabs)/inbox" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={ref} contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 20 }}>
            {msgs.length === 0 ? (
              <View style={styles.empty}><Ionicons name="people-outline" size={38} color={colors.onSurfaceSecondary} /><Text style={styles.emptyText}>Start the conversation with your crew 🥊</Text></View>
            ) : msgs.map((m) => {
              const mine = m.from_id === meId;
              return (
                <View key={m.gmsg_id} style={[styles.bubble, mine ? styles.me : styles.them]}>
                  {!mine && <Text style={styles.sender}>{m.sender_name}</Text>}
                  <Text style={[styles.msg, mine && { color: colors.onBrand }]}>{m.body}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.bar}>
          <TextInput testID="group-input" value={text} onChangeText={setText} placeholder="Message the group…" placeholderTextColor={colors.onSurfaceSecondary} style={styles.input} multiline />
          <Pressable testID="group-send" style={styles.sendBtn} onPress={send} disabled={sending || !text.trim()}>
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
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center" },
  bubble: { maxWidth: "82%", padding: spacing.md, borderRadius: radius.lg },
  me: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  them: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { color: colors.brand, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  msg: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  bar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
