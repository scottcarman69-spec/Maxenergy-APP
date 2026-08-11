import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, TextStyle } from "react-native";
import { colors, radius, font } from "@/src/theme";

// A pulsing / "flashing" highlighted line to grab attention.
export default function FlashingText({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.Text style={[styles.flash, style, { opacity }]}>{children}</Animated.Text>;
}

const styles = StyleSheet.create({
  flash: {
    color: colors.brand,
    fontFamily: font.heading,
    fontSize: 16,
    letterSpacing: 0.4,
    textAlign: "center",
    alignSelf: "stretch",
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brand,
    overflow: "hidden",
  },
});
