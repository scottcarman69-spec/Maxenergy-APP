// Shared notice (announcement) categories used by the admin Gym Notices form
// and the member Notices tab. Colors are intentionally fixed per-category so the
// same tag color reads identically in light/dark.
export type NoticeCategoryValue =
  | "general"
  | "event"
  | "class_update"
  | "closure"
  | "promotion"
  | "urgent";

export type NoticeCategory = {
  value: NoticeCategoryValue;
  label: string;
  color: string;
  icon: string; // Ionicons name
};

export const NOTICE_CATEGORIES: NoticeCategory[] = [
  { value: "general", label: "General", color: "#71717A", icon: "megaphone" },
  { value: "event", label: "Event", color: "#3B82F6", icon: "calendar" },
  { value: "class_update", label: "Class Update", color: "#FF7A00", icon: "barbell" },
  { value: "closure", label: "Closure / Holiday", color: "#EF4444", icon: "moon" },
  { value: "promotion", label: "Promotion", color: "#10B981", icon: "pricetag" },
  { value: "urgent", label: "Urgent", color: "#F59E0B", icon: "alert-circle" },
];

export function noticeCat(value?: string): NoticeCategory {
  return NOTICE_CATEGORIES.find((c) => c.value === value) || NOTICE_CATEGORIES[0];
}
