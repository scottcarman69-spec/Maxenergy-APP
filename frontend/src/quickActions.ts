// Shared Quick Actions metadata (no navigation handlers) so the Home grid and the
// "Customize" screen use one source of truth. Home attaches onPress by key.
export type QuickActionMeta = {
  key: string;
  label: string;
  icon: string;
  grad: [string, string];
};

export const QUICK_ACTIONS_META: QuickActionMeta[] = [
  { key: "booknext", label: "Book Next Class", icon: "flash", grad: ["#FF7A00", "#FFB259"] },
  { key: "bookings", label: "My Bookings", icon: "bookmark", grad: ["#0D9488", "#2DD4BF"] },
  { key: "schedule", label: "View Schedule", icon: "calendar", grad: ["#FF7A00", "#FFB259"] },
  { key: "checkin", label: "Class Check-In", icon: "checkmark-done", grad: ["#16A34A", "#4ADE80"] },
  { key: "classpass", label: "Class Pass", icon: "ticket", grad: ["#DC2626", "#F87171"] },
  { key: "academy", label: "Muay Thai Academy", icon: "shield-half", grad: ["#B45309", "#F59E0B"] },
  { key: "calendar", label: "Calendar", icon: "calendar-number", grad: ["#7C3AED", "#A78BFA"] },
  { key: "membership", label: "Join Membership", icon: "ribbon", grad: ["#2563EB", "#60A5FA"] },
  { key: "notices", label: "Gym Notices", icon: "megaphone", grad: ["#D97706", "#FBBF24"] },
  { key: "contact", label: "Contact Us", icon: "chatbubbles", grad: ["#DB2777", "#F472B6"] },
  { key: "settings", label: "Settings", icon: "options", grad: ["#475569", "#94A3B8"] },
  { key: "facebook", label: "Facebook", icon: "logo-facebook", grad: ["#1877F2", "#4293FB"] },
];

export const DEFAULT_QUICK_ORDER = QUICK_ACTIONS_META.map((a) => a.key);

// Number of tiles shown on the Home screen before "More actions".
export const HOME_QUICK_COUNT = 8;

/** Order the given keys by a saved preference, appending any keys not in the pref. */
export function orderKeys(allKeys: string[], pref?: string[] | null): string[] {
  const p = pref && pref.length ? pref : allKeys;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of p) {
    if (allKeys.includes(k) && !seen.has(k)) { out.push(k); seen.add(k); }
  }
  for (const k of allKeys) {
    if (!seen.has(k)) { out.push(k); seen.add(k); }
  }
  return out;
}
