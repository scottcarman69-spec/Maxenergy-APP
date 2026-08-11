import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { qldNowUTC, classStartMs } from "@/src/datetime";

type Cls = {
  class_id: string;
  name: string;
  trainer: string;
  duration_min: number;
  start_at: string;
  category: string;
  by_appointment?: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
// Remaining time as a countdown label (H:MM:SS while >= 1h, else MM:SS).
function fmtRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export default function LiveNowBanner({ classes }: { classes: Cls[] }) {
  const router = useRouter();
  const [now, setNow] = useState(() => qldNowUTC().getTime());

  // Tick every second so the countdown stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(qldNowUTC().getTime()), 1000);
    return () => clearInterval(id);
  }, []);

  // Pulsing "LIVE" dot.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Find a scheduled class that is currently in session.
  const live = classes.find((c) => {
    if (c.by_appointment || !c.start_at || !c.duration_min) return false;
    const start = classStartMs(c.start_at);
    const end = start + c.duration_min * 60000;
    return now >= start && now < end;
  });

  if (!live) return null;

  const start = classStartMs(live.start_at);
  const end = start + live.duration_min * 60000;
  const remaining = end - now;
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));

  return (
    <Pressable
      testID="home-live-now"
      onPress={() => router.push({ pathname: "/class/[id]", params: { id: live.class_id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.row}>
        <View style={styles.liveTag}>
          <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{live.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{live.trainer} · {live.duration_min} min</Text>
        </View>
        <View style={styles.timerPill}>
          <Ionicons name="timer-outline" size={12} color={colors.brand} />
          <Text style={styles.timerText}>{fmtRemaining(remaining)}</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${elapsed * 100}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#EF4444",
    gap: 8,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(239,68,68,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#EF4444" },
  liveText: { color: "#EF4444", fontSize: 10, fontFamily: font.heading, letterSpacing: 0.8 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  timerText: { color: colors.brand, fontSize: 12, fontFamily: font.heading, fontVariant: ["tabular-nums"] },
  name: { color: colors.onSurface, fontSize: 15, fontFamily: font.heading },
  meta: { color: colors.onSurfaceSecondary, fontSize: 11.5, marginTop: 1 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: "#EF4444" },
});
