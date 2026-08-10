import { teamPhotos } from "./gymPhotos";

// Resolve a class's coach headshot: bundled photo first, then backend URL.
export function coachSource(trainer?: string, trainerPhoto?: string): any | null {
  const t = (trainer || "").toLowerCase();
  if (t.includes("alex")) return teamPhotos["Alex Honorato"];
  if (t.includes("jamie")) return teamPhotos["Jamie Blackman"];
  if (trainerPhoto) return { uri: trainerPhoto };
  return null;
}
