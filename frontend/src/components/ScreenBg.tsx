import React from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors } from "@/src/theme";

/**
 * Subtle app background: solid black with a faint gym/fighting image and a
 * dark overlay so foreground content stays readable. Rendered as an absolute
 * layer behind screen content.
 */
export default function ScreenBg() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
      <Image
        source={require("../../assets/images/kickbox1.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.13 }]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(10,10,11,0.4)" }]} />
    </View>
  );
}
