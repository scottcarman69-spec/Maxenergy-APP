import { Platform, Linking } from "react-native";
import * as Calendar from "expo-calendar";
import { api } from "@/src/api";

type Result = { ok: boolean; message: string };

/**
 * Add a booking to the member's calendar.
 * - Web: opens Google Calendar in a new tab.
 * - Native: opens the system "Add Event" sheet pre-filled (expo-calendar),
 *   falling back to the hosted .ics (iOS) / Google link if unavailable.
 */
export async function addBookingToCalendar(bookingId: string): Promise<Result> {
  let details: any;
  try {
    details = await api.bookingCalendar(bookingId);
  } catch (e: any) {
    return { ok: false, message: e?.message || "Couldn't load calendar details." };
  }

  const start = new Date(details.start);
  const end = new Date(details.end);
  const reminder = Number(details.reminder_minutes || 60);

  if (Platform.OS === "web") {
    if (details.google_url && typeof window !== "undefined") {
      window.open(details.google_url, "_blank");
      return { ok: true, message: "Opening Google Calendar…" };
    }
    return { ok: false, message: "Calendar isn't available here." };
  }

  // Native: present the OS "Add to calendar" editor pre-filled.
  try {
    const anyCal: any = Calendar as any;
    if (typeof anyCal.createEventInCalendarAsync === "function") {
      await anyCal.createEventInCalendarAsync({
        title: details.title,
        startDate: start,
        endDate: end,
        location: details.location,
        notes: details.notes,
        alarms: [{ relativeOffset: -reminder }],
      });
      return { ok: true, message: "Opened your calendar." };
    }
  } catch (e) {
    // fall through to the link-based fallback below
  }

  const url = Platform.OS === "ios" ? (details.ics_url || details.google_url) : details.google_url;
  if (url) {
    try {
      await Linking.openURL(url);
      return { ok: true, message: "Opening your calendar…" };
    } catch {
      /* ignore */
    }
  }
  return { ok: false, message: "Couldn't open your calendar." };
}
