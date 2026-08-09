import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, PanResponder, GestureResponderEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

/**
 * Cross-platform draw-to-sign pad.
 * Captures strokes as SVG path strings. onChange returns a single combined
 * SVG path `d` string (empty string when cleared). Works on web + native.
 */
export function SignaturePad({
  onChange,
  onDrawStart,
  onDrawEnd,
  height = 180,
  testID,
}: {
  onChange: (svgPath: string) => void;
  onDrawStart?: () => void;
  onDrawEnd?: () => void;
  height?: number;
  testID?: string;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const current = useRef<string>("");
  const finalized = useRef<string[]>([]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        onDrawStart && onDrawStart();
        const { locationX, locationY } = e.nativeEvent;
        current.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setActive(current.current);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        current.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setActive(current.current);
      },
      onPanResponderRelease: () => {
        if (current.current && current.current.includes("L")) {
          finalized.current = [...finalized.current, current.current];
          setPaths(finalized.current);
          onChange(finalized.current.join(" "));
        }
        current.current = "";
        setActive("");
        onDrawEnd && onDrawEnd();
      },
      onPanResponderTerminate: () => {
        onDrawEnd && onDrawEnd();
      },
    })
  ).current;

  const clear = () => {
    finalized.current = [];
    current.current = "";
    setPaths([]);
    setActive("");
    onChange("");
  };

  const hasContent = paths.length > 0 || active.length > 0;

  return (
    <View testID={testID}>
      <View style={[styles.pad, { height }]} {...responder.panHandlers} collapsable={false}>
        <Svg width="100%" height="100%" pointerEvents="none">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={colors.onSurface} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {!!active && (
            <Path d={active} stroke={colors.onSurface} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          )}
        </Svg>
        {!hasContent && (
          <View style={styles.placeholder} pointerEvents="none">
            <Ionicons name="pencil" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.placeholderText}>Sign here with your finger</Text>
          </View>
        )}
      </View>
      <Pressable testID={testID ? `${testID}-clear` : undefined} onPress={clear} style={styles.clearBtn}>
        <Ionicons name="refresh" size={14} color={colors.onSurfaceSecondary} />
        <Text style={styles.clearText}>Clear signature</Text>
      </Pressable>
    </View>
  );
}

/** Read-only renderer for a stored signature path string. */
export function SignatureView({ d, height = 120 }: { d: string; height?: number }) {
  if (!d) return null;
  return (
    <View style={[styles.viewPad, { height }]}>
      <Svg width="100%" height="100%">
        <Path d={d} stroke={colors.onSurface} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  placeholderText: { color: "#9CA3AF", fontSize: 13 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", paddingVertical: spacing.sm },
  clearText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  viewPad: { backgroundColor: "#FFFFFF", borderRadius: radius.md, overflow: "hidden" },
});
