import { ImageSourcePropType } from "react-native";

// Official/exclusive gym groups carry a bundled logo, mapped by their slug.
const OFFICIAL_LOGOS: Record<string, ImageSourcePropType> = {
  "muay-thai-academy": require("../assets/images/combat-logo.webp"),
};

export function groupLogo(slug?: string | null): ImageSourcePropType | null {
  if (!slug) return null;
  return OFFICIAL_LOGOS[slug] || null;
}
