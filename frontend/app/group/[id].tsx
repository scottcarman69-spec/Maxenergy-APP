import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert, Modal } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";
import EmojiButton from "@/src/components/EmojiButton";

type Reaction = { emoji: string; count: number; mine: boolean };
type ReplyTo = { gmsg_id: string; sender_name: string; body: string };
type GM = { gmsg_id: string; from_id: string; sender_name: string; body: string; created_at: string; seen_count?: number; member_count?: number; edited_at?: string; reaction_summary?: Reaction[]; reply_to?: ReplyTo | null };

const REACTIONS = ["👍", "🔥", "😂", "❤️", "😮", "🙏"];

function shortName(full?: string): string {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// Memoised so typing / new messages don't re-render every existing bubble (keeps the chat smooth).
const MessageRow = React.memo(function MessageRow({ m, mine, canDelete, showReceipt, onUnsend, onLongPress, onReact }: { m: GM; mine: boolean; canDelete: boolean; showReceipt: boolean; onUnsend: (m: GM) => void; onLongPress: (m: GM) => void; onReact: (m: GM, emoji: string) => void }) {
  if (m.from_id === "system") {
    return (
      <View style={styles.announce}>
        <View style={styles.announceHead}>
          <Ionicons name="megaphone" size={14} color={colors.brand} />
          <Text style={styles.announceLabel}>GYM ANNOUNCEMENT</Text>
        </View>
        <Text style={styles.announceBody}>{m.body}</Text>
      </View>
    );
  }
  const reactions = m.reaction_summary || [];
  const bubbleInner = (
    <View style={[styles.bubble, mine ? styles.me : styles.them]}>
      {!mine && <Text style={styles.sender}>{shortName(m.sender_name)}</Text>}
      {!!m.reply_to && (
        <View style={[styles.replyQuote, mine && { borderLeftColor: "rgba(255,255,255,0.6)" }]}>
          <Text style={[styles.replyName, mine && { color: "rgba(255,255,255,0.9)" }]} numberOfLines={1}>{shortName(m.reply_to.sender_name)}</Text>
          <Text style={[styles.replyBody, mine && { color: "rgba(255,255,255,0.8)" }]} numberOfLines={1}>{m.reply_to.body}</Text>
        </View>
      )}
      <Text style={[styles.msg, mine && { color: colors.onBrand }]}>{m.body}</Text>
      {!!m.edited_at && <Text style={[styles.editedTag, mine && { color: "rgba(255,255,255,0.75)" }]}>edited</Text>}
    </View>
  );
  const bubble = (
    <View style={styles.rowWrap}>
      <Pressable onLongPress={() => onLongPress(m)} delayLongPress={300} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
        {bubbleInner}
      </Pressable>
      {reactions.length > 0 && (
        <View style={[styles.reactionRow, { alignSelf: mine ? "flex-end" : "flex-start" }]}>
          {reactions.map((r) => (
            <Pressable key={r.emoji} onPress={() => onReact(m, r.emoji)} style={[styles.reactionChip, r.mine && styles.reactionChipMine]}>
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              <Text style={[styles.reactionCount, r.mine && { color: colors.brand }]}>{r.count}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {mine && showReceipt && (
        <Text style={styles.receipt}>{(m.seen_count || 0) > 0 ? `Seen by ${m.seen_count}` : "Sent"}</Text>
      )}
    </View>
  );
  if (!canDelete) return bubble;
  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <View style={styles.unsendWrap}>
          <Pressable testID={`group-unsend-${m.gmsg_id}`} style={styles.unsendAction} onPress={() => onUnsend(m)}>
            <Ionicons name="trash" size={18} color="#fff" />
            <Text style={styles.unsendText}>{mine ? "Unsend" : "Delete"}</Text>
          </Pressable>
        </View>
      )}
      overshootRight={false}
      friction={1.6}
      rightThreshold={36}
      dragOffsetFromRightEdge={16}
    >
      {bubble}
    </ReanimatedSwipeable>
  );
});

export default function GroupChat() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [msgs, setMsgs] = useState<GM[]>([]);
  const [gname, setGname] = useState(String(name || "Group"));
  const [count, setCount] = useState(0);
  const [pinned, setPinned] = useState<string | null>(null);
  const [pinExpanded, setPinExpanded] = useState(false);
  const [meId, setMeId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);
  const [editing, setEditing] = useState<GM | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [replyTo, setReplyTo] = useState<GM | null>(null);
  const [actionMsg, setActionMsg] = useState<GM | null>(null);
  const ref = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const [r, me] = await Promise.all([api.groupGet(String(id)), api.me()]);
      setMsgs(r.messages || []); setGname(r.group?.name || gname); setCount((r.group?.members || []).length);
      setPinned(r.group?.pinned_note || null);
      setMeId(me?.user?.user_id || "");
      setIsAdmin(!!me?.user?.is_admin);
      setOwnerId(r.group?.owner_id || "");
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
    const replyId = replyTo?.gmsg_id;
    setSending(true); setText(""); setReplyTo(null);
    try { const r = await api.groupSend(String(id), body, replyId); setMsgs((m) => [...m, r.message]); setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 100); }
    catch { setText(body); }
    setSending(false);
  };

  const react = useCallback(async (m: GM, emoji: string) => {
    try {
      const r = await api.groupReact(String(id), m.gmsg_id, emoji);
      setMsgs((cur) => cur.map((x) => (x.gmsg_id === m.gmsg_id ? { ...x, reaction_summary: r.reaction_summary } : x)));
    } catch {}
  }, [id]);

  const openActions = useCallback((m: GM) => setActionMsg(m), []);

  const unsend = useCallback((m: GM) => {
    const own = m.from_id === meId;
    Alert.alert(
      own ? "Unsend message?" : "Delete message?",
      "This removes the message for everyone in the group.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: own ? "Unsend" : "Delete",
          style: "destructive",
          onPress: async () => {
            setMsgs((cur) => cur.filter((x) => x.gmsg_id !== m.gmsg_id));
            try { await api.groupDeleteMessage(String(id), m.gmsg_id); }
            catch { load(); }
          },
        },
      ]
    );
  }, [id, meId, load]);

  const startEdit = useCallback((m: GM) => {
    setEditing(m);
    setEditText(m.body);
  }, []);

  const saveEdit = async () => {
    if (!editing) return;
    const body = editText.trim();
    if (!body || body === editing.body) { setEditing(null); return; }
    setSavingEdit(true);
    const gmsgId = editing.gmsg_id;
    setMsgs((cur) => cur.map((x) => (x.gmsg_id === gmsgId ? { ...x, body, edited_at: new Date().toISOString() } : x)));
    try { await api.groupEditMessage(String(id), gmsgId, body); }
    catch { load(); }
    setSavingEdit(false);
    setEditing(null);
  };

  const lastOwnIndex = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].from_id === meId) return i; }
    return -1;
  })();

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
            ) : msgs.map((m, i) => {
              const mine = m.from_id === meId;
              const canDelete = m.from_id !== "system" && (mine || isAdmin || ownerId === meId);
              return <MessageRow key={m.gmsg_id} m={m} mine={mine} canDelete={canDelete} showReceipt={i === lastOwnIndex} onUnsend={unsend} onLongPress={openActions} onReact={react} />;
            })}
            {msgs.length > 0 && (
              <Text style={styles.swipeHint}>Hold a message to react, reply or edit · swipe left to unsend</Text>
            )}
          </ScrollView>
        )}
        {!!replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarLine} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarName}>Replying to {shortName(replyTo.sender_name)}</Text>
              <Text style={styles.replyBarBody} numberOfLines={1}>{replyTo.body}</Text>
            </View>
            <Pressable testID="group-reply-cancel" hitSlop={10} onPress={() => setReplyTo(null)}>
              <Ionicons name="close-circle" size={22} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>
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

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.editOverlay}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit message</Text>
            <TextInput
              testID="group-edit-input"
              value={editText}
              onChangeText={setEditText}
              style={styles.editInput}
              placeholder="Update your message…"
              placeholderTextColor={colors.onSurfaceSecondary}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <Pressable style={styles.editCancel} onPress={() => setEditing(null)} disabled={savingEdit}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable testID="group-edit-save" style={[styles.editSave, savingEdit && { opacity: 0.6 }]} onPress={saveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.editSaveText}>SAVE</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!actionMsg} transparent animationType="fade" onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setActionMsg(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.reactionPicker}>
              {REACTIONS.map((e) => (
                <Pressable key={e} testID={`react-${e}`} style={styles.reactionPick} onPress={() => { if (actionMsg) react(actionMsg, e); setActionMsg(null); }}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable testID="action-reply" style={styles.sheetItem} onPress={() => { setReplyTo(actionMsg); setActionMsg(null); }}>
              <Ionicons name="arrow-undo" size={20} color={colors.onSurface} />
              <Text style={styles.sheetItemText}>Reply</Text>
            </Pressable>
            {actionMsg?.from_id === meId && (
              <Pressable testID="action-edit" style={styles.sheetItem} onPress={() => { const m = actionMsg; setActionMsg(null); if (m) startEdit(m); }}>
                <Ionicons name="create-outline" size={20} color={colors.onSurface} />
                <Text style={styles.sheetItemText}>Edit</Text>
              </Pressable>
            )}
            {(actionMsg?.from_id === meId || isAdmin || ownerId === meId) && actionMsg?.from_id !== "system" && (
              <Pressable testID="action-unsend" style={styles.sheetItem} onPress={() => { const m = actionMsg; setActionMsg(null); if (m) unsend(m); }}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={[styles.sheetItemText, { color: colors.error }]}>{actionMsg?.from_id === meId ? "Unsend" : "Delete"}</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  rowWrap: { width: "100%" },
  me: { alignSelf: "flex-end", backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  them: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  sender: { color: colors.brand, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  announce: { alignSelf: "stretch", backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brand, borderRadius: radius.lg, padding: spacing.md, gap: 5 },
  announceHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  announceLabel: { color: colors.brand, fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  announceBody: { color: colors.onSurface, fontSize: 14.5, lineHeight: 20 },
  msg: { color: colors.onSurface, fontSize: 15, lineHeight: 20 },
  editedTag: { fontSize: 10, color: colors.onSurfaceSecondary, marginTop: 3, fontStyle: "italic" },
  receipt: { alignSelf: "flex-end", color: colors.onSurfaceSecondary, fontSize: 10.5, marginTop: 3, marginRight: 2 },
  replyQuote: { borderLeftWidth: 3, borderLeftColor: colors.brand, paddingLeft: 8, marginBottom: 6, opacity: 0.95 },
  replyName: { color: colors.brand, fontSize: 11.5, fontWeight: "800" },
  replyBody: { color: colors.onSurfaceSecondary, fontSize: 12 },
  reactionRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  reactionChipMine: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceSecondary },
  replyBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 8, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
  replyBarLine: { width: 3, alignSelf: "stretch", backgroundColor: colors.brand, borderRadius: 2 },
  replyBarName: { color: colors.brand, fontSize: 12, fontWeight: "800" },
  replyBarBody: { color: colors.onSurfaceSecondary, fontSize: 12.5 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: 32, gap: 4 },
  reactionPicker: { flexDirection: "row", justifyContent: "space-around", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingVertical: 8, marginBottom: spacing.md },
  reactionPick: { paddingHorizontal: 4 },
  sheetItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 6 },
  sheetItemText: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  unsendWrap: { justifyContent: "center", paddingLeft: spacing.sm },
  unsendAction: { backgroundColor: colors.error, justifyContent: "center", alignItems: "center", width: 84, alignSelf: "stretch", borderRadius: radius.lg, gap: 2 },
  unsendText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  swipeHint: { color: colors.onSurfaceSecondary, fontSize: 11, textAlign: "center", marginTop: 4, opacity: 0.7 },
  bar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.onSurface, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  editOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.xl },
  editCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  editTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "900", marginBottom: spacing.md },
  editInput: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, fontSize: 15, minHeight: 80, textAlignVertical: "top" },
  editActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  editCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  editCancelText: { color: colors.onSurface, fontWeight: "800" },
  editSave: { flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: radius.md, backgroundColor: colors.brand },
  editSaveText: { color: colors.onBrand, fontWeight: "900", letterSpacing: 1 },
});
