import { storage } from "@/src/utils/storage";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "auth_token";

export type User = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  is_admin?: boolean;
  verified?: boolean;
  reminder_hours?: number;
  credit_cents?: number;
};

export async function getToken(): Promise<string | null> {
  return (await storage.secureGet<string>(TOKEN_KEY, "")) || null;
}
export async function setToken(token: string) {
  await storage.secureSet(TOKEN_KEY, token);
}
export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

async function req(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    if (data && data.detail) {
      if (typeof data.detail === "string") {
        msg = data.detail;
      } else if (Array.isArray(data.detail)) {
        msg = data.detail.map((d: any) => d?.msg || "Invalid input").join(", ");
      }
    }
    throw new Error(msg);
  }
  return data;
}

export const api = {
  register: (name: string, email: string, password: string) =>
    req("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  googleSession: (session_id: string) =>
    req("/api/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/api/auth/me"),
  setReminderPreference: (hours: number) =>
    req("/api/me/reminder-preference", { method: "PUT", body: JSON.stringify({ hours }) }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  deleteAccount: () => req("/api/auth/account", { method: "DELETE" }),
  verifyOtp: (email: string, code: string) =>
    req("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, code }) }),
  resendOtp: (email: string) =>
    req("/api/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) }),
  forgotPassword: (email: string) =>
    req("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (email: string, code: string, new_password: string) =>
    req("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, code, new_password }) }),

  classes: (category?: string, includeEnded?: boolean) => {
    const params = new URLSearchParams();
    if (category && category !== "All") params.set("category", category);
    if (includeEnded) params.set("include_ended", "true");
    const qs = params.toString();
    return req(`/api/classes${qs ? `?${qs}` : ""}`);
  },
  classDetail: (id: string) => req(`/api/classes/${id}`),
  createBooking: (class_id: string, requested_time?: string, requested_at?: string) =>
    req("/api/bookings", { method: "POST", body: JSON.stringify({ class_id, requested_time, requested_at }) }),
  myBookings: () => req("/api/bookings"),
  bookingsHistory: () => req("/api/bookings/history"),
  clearAllBookings: () => req("/api/bookings/clear-all", { method: "POST" }),
  clearBooking: (id: string) => req(`/api/bookings/${id}/clear`, { method: "POST" }),
  cancelBooking: (id: string) => req(`/api/bookings/${id}/cancel`, { method: "POST" }),
  checkinBooking: (id: string) => req(`/api/bookings/${id}/checkin`, { method: "POST" }),
  rescheduleBooking: (id: string, requested_time: string, note?: string) =>
    req(`/api/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ requested_time, note }) }),

  checkout: (booking_id: string, origin_url: string, use_credit?: boolean) =>
    req("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ booking_id, origin_url, use_credit: !!use_credit }),
    }),
  paymentStatus: (session_id: string) => req(`/api/payments/status/${session_id}`),
  reconcilePayments: () => req("/api/payments/reconcile", { method: "POST" }),
  paymentReceipt: (booking_id: string) => req(`/api/payments/receipt/${booking_id}`),
  myReceipts: () => req("/api/payments/receipts"),
  myCredits: () => req("/api/credits"),
  storeProducts: () => req("/api/store/products"),
  storeCheckout: (product_id: string, origin_url: string, extra?: { start_date?: string; meet_time?: string }) =>
    req("/api/store/checkout", { method: "POST", body: JSON.stringify({ product_id, origin_url, ...(extra || {}) }) }),
  storeStatus: (session_id: string) => req(`/api/store/status/${session_id}`),
  storeReceipt: (session_id: string) => req(`/api/store/receipt/${session_id}`),
  storeReceiptLatest: () => req(`/api/store/receipt/latest`),
  checkinCode: (booking_id: string) => req(`/api/bookings/${booking_id}/checkin-code`),
  scanCheckin: (code: string) =>
    req("/api/admin/checkin/scan", { method: "POST", body: JSON.stringify({ code }) }),

  events: () => req("/api/events"),
  eventDetail: (id: string) => req(`/api/events/${id}`),
  rsvp: (event_id: string) =>
    req("/api/events/rsvp", { method: "POST", body: JSON.stringify({ event_id }) }),

  announcements: () => req("/api/announcements"),
  gymInfo: () => req("/api/gym/info"),
  about: () => req("/api/about"),
  services: () => req("/api/services"),
  locations: () => req("/api/locations"),
  reviews: () => req("/api/reviews"),

  myTrials: () => req("/api/trials/me"),
  claimTrial: (category: string, extra?: { child_name?: string; child_age?: string; attendee_name?: string; preferred_day?: string }) =>
    req("/api/trials/claim", { method: "POST", body: JSON.stringify({ category, ...(extra || {}) }) }),

  plans: () => req("/api/membership/plans"),
  applyMembership: (payload: {
    plan_id: string;
    full_name: string;
    phone: string;
    category: string;
    experience?: string;
    message?: string;
    details?: Record<string, any>;
  }) => req("/api/membership/apply", { method: "POST", body: JSON.stringify(payload) }),
  myApplications: () => req("/api/membership/applications/me"),
  reportVigyrSignup: (completed: boolean) =>
    req("/api/membership/vigyr-report", { method: "POST", body: JSON.stringify({ completed }) }),

  notifications: () => req("/api/notifications"),
  notificationsHistory: () => req("/api/notifications/history"),
  markRead: (id: string) => req(`/api/notifications/${id}/read`, { method: "POST" }),
  deleteNotification: (id: string) => req(`/api/notifications/${id}`, { method: "DELETE" }),
  unreadNotifications: () => req("/api/notifications/unread"),
  markAllNotificationsRead: () => req("/api/notifications/read-all", { method: "POST" }),
  clearAllNotifications: () => req("/api/notifications/clear-all", { method: "POST" }),

  // admin
  adminOverview: () => req("/api/admin/overview"),
  adminClasses: () => req("/api/admin/classes"),
  adminCreateClass: (payload: any) =>
    req("/api/admin/classes", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateClass: (id: string, payload: any) =>
    req(`/api/admin/classes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteClass: (id: string) => req(`/api/admin/classes/${id}`, { method: "DELETE" }),
  adminCancelClass: (id: string, reason?: string) =>
    req(`/api/admin/classes/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason || "" }) }),
  adminRestoreClass: (id: string) => req(`/api/admin/classes/${id}/restore`, { method: "POST" }),
  adminRefunds: () => req("/api/admin/refunds"),
  adminResolveRefund: (booking_id: string, method: "credit" | "refunded") =>
    req(`/api/admin/refunds/${booking_id}/resolve`, { method: "POST", body: JSON.stringify({ method }) }),
  adminAdjustCredit: (user_id: string, amount_cents: number, reason?: string) =>
    req(`/api/admin/members/${user_id}/credit`, { method: "POST", body: JSON.stringify({ amount_cents, reason: reason || "" }) }),
  adminCreateAnnouncement: (payload: { title: string; body: string; pinned: boolean }) =>
    req("/api/admin/announcements", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateAnnouncement: (id: string, payload: { title: string; body: string; pinned: boolean }) =>
    req(`/api/admin/announcements/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  adminDeleteAnnouncement: (id: string) =>
    req(`/api/admin/announcements/${id}`, { method: "DELETE" }),
  adminApplications: () => req("/api/admin/applications"),
  adminMembershipLog: () => req("/api/admin/membership-log"),
  adminSetApplicationStatus: (id: string, status: string) =>
    req(`/api/admin/applications/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adminBookings: () => req("/api/admin/bookings"),
  adminMembers: () => req("/api/admin/members"),
  exportMembers: () => req("/api/admin/members/export", { method: "POST" }),  adminAcceptBooking: (id: string) => req(`/api/admin/bookings/${id}/accept`, { method: "POST" }),
  adminCancelBooking: (id: string) => req(`/api/admin/bookings/${id}/cancel`, { method: "POST" }),
  adminRescheduleBooking: (id: string, new_time: string, note?: string) =>
    req(`/api/admin/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ new_time, note }) }),
  adminSetAttendance: (id: string, attended: boolean) =>
    req(`/api/admin/bookings/${id}/attendance`, { method: "POST", body: JSON.stringify({ attended }) }),
  attendanceReport: () => req("/api/admin/attendance/report"),
  // messaging
  myMessages: () => req("/api/messages"),
  unreadMessages: () => req("/api/messages/unread"),
  sendMessage: (body: string) => req("/api/messages", { method: "POST", body: JSON.stringify({ body }) }),
  adminThreads: () => req("/api/admin/threads"),
  adminThreadMessages: (userId: string) => req(`/api/admin/threads/${userId}`),
  adminThreadReply: (userId: string, body: string) =>
    req(`/api/admin/threads/${userId}`, { method: "POST", body: JSON.stringify({ body }) }),
};

export const BACKEND_URL = API_URL;
