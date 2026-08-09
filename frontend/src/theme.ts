import { StyleSheet } from "react-native";

export const colors = {
  surface: "#121214",
  onSurface: "#F9FAFB",
  surfaceSecondary: "#1C1C1F",
  onSurfaceSecondary: "#A1A1AA",
  surfaceTertiary: "#27272A",
  onSurfaceTertiary: "#E4E4E7",
  brand: "#FF7A00",
  onBrand: "#FFFFFF",
  brandTertiary: "rgba(255, 122, 0, 0.15)",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#71717A",
  border: "#27272A",
  borderStrong: "#3F3F46",
  divider: "#1C1C1F",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };

export const font = {
  display: "Anton",
  heading: "DMSans-Bold",
  semibold: "DMSans-SemiBold",
  medium: "DMSans-Medium",
  text: "DMSans",
};

export const type = StyleSheet.create({
  h1: { fontSize: 32, fontFamily: font.display, color: colors.onSurface, letterSpacing: 0.3 },
  h2: { fontSize: 25, fontFamily: font.display, color: colors.onSurface, letterSpacing: 0.3 },
  h3: { fontSize: 19, fontFamily: font.heading, color: colors.onSurface },
  eyebrow: { fontSize: 11, fontFamily: font.heading, color: colors.onSurfaceSecondary, letterSpacing: 1.5, textTransform: "uppercase" },
  body: { fontSize: 14, fontFamily: font.text, color: colors.onSurface },
  bodyDim: { fontSize: 14, fontFamily: font.text, color: colors.onSurfaceSecondary },
  small: { fontSize: 12, fontFamily: font.text, color: colors.onSurfaceSecondary },
});
