import { storage } from "@/src/utils/storage";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "auth_token";

export type Child = {
  child_id: string;
  name: string;
  age: number;
};

export type User = {
  user_id: string;
  email: string;
  name?: string | null;
  handle?: string | null;
  phone?: string | null;
  picture?: string | null;
  is_admin?: boolean;
  verified?: boolean;
  reminder_hours?: number;
  cal_reminder_default?: number;
  quick_actions_order?: string[];
  child_age_default?: number;
  children?: Child[];
  credit_cents?: number;
  class_pass_credits?: number;
  membership_form_completed?: boolean;
  vigyr_signup_reported?: boolean;
  membership_active?: boolean;
  champion_disciplines?: string[];
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

// Global handler invoked when an authenticated request is rejected with 401
// (e.g. the saved token is expired/invalid). Lets the app auto-logout + redirect.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
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
    // A 401 on a PROTECTED endpoint (whether or not a token was sent) means the
    // session is invalid or missing -> clear it and bounce to login, so the user
    // never gets stuck on a half-authenticated screen. Auth endpoints (login,
    // register, reset) keep their own messages (e.g. "Invalid credentials").
    const isAuthEndpoint = path.startsWith("/api/auth/");
    if (res.status === 401 && !isAuthEndpoint) {
      await clearToken();
      if (onUnauthorized) onUnauthorized();
    }
    let msg = `Request failed (${res.status})`;
    if (data && data.detail) {
      if (typeof data.detail === "string") {
        msg = data.detail;
      } else if (Array.isArray(data.detail)) {
        msg = data.detail.map((d: any) => d?.msg || "Invalid input").join(", ");
      }
    }
    if (res.status === 401 && !isAuthEndpoint) {
      msg = "Your session has expired. Please log in again.";
    }
    throw new Error(msg);
  }
  return data;
}

export const api = {
  register: (payload: { first_name: string; last_name: string; date_of_birth: string; phone: string; email: string; password: string }) =>
    req("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (email: string, password: string) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  googleSession: (session_id: string) =>
    req("/api/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  me: () => req("/api/auth/me"),
  setReminderPreference: (hours: number) =>
    req("/api/me/reminder-preference", { method: "PUT", body: JSON.stringify({ hours }) }),
  setCalReminderDefault: (minutes: number) =>
    req("/api/me/calendar-reminder", { method: "PUT", body: JSON.stringify({ minutes }) }),
  setQuickActionsOrder: (order: string[]) =>
    req("/api/me/quick-actions", { method: "PUT", body: JSON.stringify({ order }) }),
  setMessageNotifications: (enabled: boolean) =>
    req("/api/me/message-notifications", { method: "PUT", body: JSON.stringify({ enabled }) }),
  setQuietHours: (payload: { enabled: boolean; start: string; end: string }) =>
    req("/api/me/quiet-hours", { method: "PUT", body: JSON.stringify(payload) }),
  logout: () => req("/api/auth/logout", { method: "POST" }),
  deleteAccount: () => req("/api/auth/account", { method: "DELETE" }),
  changePassword: (current_password: string, new_password: string) =>
    req("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
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
  createBooking: (class_id: string, requested_time?: string, requested_at?: string, duration_min?: number, cal_reminder_minutes?: number, child_age?: number, child_name?: string, child_id?: string) =>
    req("/api/bookings", { method: "POST", body: JSON.stringify({ class_id, requested_time, requested_at, duration_min, cal_reminder_minutes, child_age, child_name, child_id }) }),
  myChildren: (): Promise<{ children: Child[] }> => req("/api/me/children"),
  addChild: (name: string, age: number): Promise<{ children: Child[] }> => req("/api/me/children", { method: "POST", body: JSON.stringify({ name, age }) }),
  updateChild: (childId: string, name: string, age: number): Promise<{ children: Child[] }> => req(`/api/me/children/${childId}`, { method: "PUT", body: JSON.stringify({ name, age }) }),
  deleteChild: (childId: string): Promise<{ children: Child[] }> => req(`/api/me/children/${childId}`, { method: "DELETE" }),
  myBookings: () => req("/api/bookings"),
  bookingCalendar: (id: string) => req(`/api/bookings/${id}/calendar`),
  appointmentsTaken: () => req("/api/appointments/taken"),
  adminAddAppointment: (body: { class_id: string; requested_at: string; requested_time?: string; duration_min?: number; note?: string }) =>
    req("/api/admin/appointments", { method: "POST", body: JSON.stringify(body) }),
  meStats: () => req("/api/me/stats"),
  bookingsHistory: () => req("/api/bookings/history"),
  clearAllBookings: () => req("/api/bookings/clear-all", { method: "POST" }),
  clearBooking: (id: string) => req(`/api/bookings/${id}/clear`, { method: "POST" }),
  cancelBooking: (id: string) => req(`/api/bookings/${id}/cancel`, { method: "POST" }),
  checkinBooking: (id: string) => req(`/api/bookings/${id}/checkin`, { method: "POST" }),
  rescheduleBooking: (id: string, requested_time: string, note?: string, requested_at?: string) =>
    req(`/api/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ requested_time, note, requested_at }) }),
  confirmProposedTime: (id: string) => req(`/api/bookings/${id}/confirm-time`, { method: "POST" }),

  bookingSettings: () => req("/api/settings/booking"),
  adminSettings: () => req("/api/admin/settings"),
  adminUpdateSettings: (cancel_window_hours: number) =>
    req("/api/admin/settings", { method: "PUT", body: JSON.stringify({ cancel_window_hours }) }),

  checkout: (booking_id: string, origin_url: string, use_credit?: boolean, use_class_pass?: boolean) =>
    req("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ booking_id, origin_url, use_credit: !!use_credit, use_class_pass: !!use_class_pass }),
    }),
  paymentStatus: (session_id: string) => req(`/api/payments/status/${session_id}`),
  reconcilePayments: () => req("/api/payments/reconcile", { method: "POST" }),
  paymentReceipt: (booking_id: string) => req(`/api/payments/receipt/${booking_id}`),
  myReceipts: () => req("/api/payments/receipts"),
  myCredits: () => req("/api/credits"),
  leaderboard: (period: "month" | "year" | "all", discipline?: string) =>
    req(`/api/leaderboard?period=${period}&discipline=${encodeURIComponent(discipline || "all")}`),
  setLeaderboardVisibility: (opt_out: boolean) =>
    req("/api/me/leaderboard-visibility", { method: "PUT", body: JSON.stringify({ opt_out }) }),
  storeProducts: () => req("/api/store/products"),
  storeCheckout: (product_id: string, origin_url: string, extra?: { start_date?: string; meet_time?: string }) =>
    req("/api/store/checkout", { method: "POST", body: JSON.stringify({ product_id, origin_url, ...(extra || {}) }) }),
  storeStatus: (session_id: string) => req(`/api/store/status/${session_id}`),
  storeReceipt: (session_id: string) => req(`/api/store/receipt/${session_id}`),
  storeReceiptLatest: () => req(`/api/store/receipt/latest`),
  checkinCode: (booking_id: string) => req(`/api/bookings/${booking_id}/checkin-code`),
  classPassQr: () => req(`/api/passes/qr`),
  scanCheckin: (code: string) =>
    req("/api/admin/checkin/scan", { method: "POST", body: JSON.stringify({ code }) }),

  events: () => req("/api/events"),
  eventDetail: (id: string) => req(`/api/events/${id}`),
  trackNoticesView: () => req("/api/views/notices", { method: "POST" }),
  trackBookingsView: () => req("/api/views/bookings", { method: "POST" }),
  homeBadges: () => req("/api/home/badges"),
  trackEventView: (id: string) => req(`/api/views/event/${id}`, { method: "POST" }),
  trackAnnouncementView: (id: string) => req(`/api/views/announcement/${id}`, { method: "POST" }),
  adminViews: () => req("/api/admin/views"),
  rsvp: (event_id: string) =>
    req("/api/events/rsvp", { method: "POST", body: JSON.stringify({ event_id }) }),

  announcements: () => req("/api/announcements"),
  gymInfo: () => req("/api/gym/info"),
  about: () => req("/api/about"),
  services: () => req("/api/services"),
  locations: () => req("/api/locations"),
  reviews: () => req("/api/reviews"),

  myTrials: () => req("/api/trials/me"),
  waitlistsMe: () => req("/api/waitlists/me"),
  waitlistJoin: (classId: string) => req(`/api/classes/${classId}/waitlist`, { method: "POST" }),
  waitlistLeave: (classId: string) => req(`/api/classes/${classId}/waitlist`, { method: "DELETE" }),
  trialSessions: (category: string) => req(`/api/trials/sessions?category=${encodeURIComponent(category)}`),
  claimTrial: (category: string, extra?: { child_name?: string; child_age?: string; attendee_name?: string; class_id?: string }) =>
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
  setMyPhoto: (image: string) => req("/api/me/photo", { method: "POST", body: JSON.stringify({ image }) }),
  searchMembers: (q: string) => req(`/api/members/search?q=${encodeURIComponent(q)}`),
  friendRequest: (payload: { user_id?: string; handle?: string }) => req("/api/friends/request", { method: "POST", body: JSON.stringify(payload) }),
  friends: () => req("/api/friends"),
  friendsBlocked: () => req("/api/friends/blocked"),
  friendRespond: (user_id: string, accept: boolean) => req("/api/friends/respond", { method: "POST", body: JSON.stringify({ user_id, accept }) }),
  friendBlock: (user_id: string) => req("/api/friends/block", { method: "POST", body: JSON.stringify({ user_id }) }),
  friendUnblock: (user_id: string) => req("/api/friends/unblock", { method: "POST", body: JSON.stringify({ user_id }) }),
  friendReport: (user_id: string, reason: string) => req("/api/friends/report", { method: "POST", body: JSON.stringify({ user_id, reason }) }),
  dmThreads: () => req("/api/dm/threads"),
  dmUnread: () => req("/api/dm/unread"),
  dmMessages: (otherId: string) => req(`/api/dm/${otherId}`),
  dmSend: (otherId: string, body: string) => req(`/api/dm/${otherId}`, { method: "POST", body: JSON.stringify({ body }) }),
  dmTyping: (otherId: string) => req(`/api/dm/${otherId}/typing`, { method: "POST" }),
  createGroup: (name: string, member_ids: string[]) => req("/api/groups", { method: "POST", body: JSON.stringify({ name, member_ids }) }),
  groups: () => req("/api/groups"),
  groupGet: (id: string) => req(`/api/groups/${id}`),
  groupSend: (id: string, body: string, replyToId?: string) => req(`/api/groups/${id}/messages`, { method: "POST", body: JSON.stringify({ body, reply_to_id: replyToId }) }),
  groupReact: (id: string, gmsgId: string, emoji: string) => req(`/api/groups/${id}/messages/${gmsgId}/react`, { method: "POST", body: JSON.stringify({ emoji }) }),
  groupPin: (id: string, gmsgId: string) => req(`/api/groups/${id}/pin`, { method: "POST", body: JSON.stringify({ gmsg_id: gmsgId }) }),
  groupUnpin: (id: string) => req(`/api/groups/${id}/unpin`, { method: "POST" }),
  groupTyping: (id: string) => req(`/api/groups/${id}/typing`, { method: "POST" }),
  groupTypingGet: (id: string) => req(`/api/groups/${id}/typing`),
  groupDeleteMessage: (id: string, gmsgId: string) => req(`/api/groups/${id}/messages/${gmsgId}`, { method: "DELETE" }),
  groupEditMessage: (id: string, gmsgId: string, body: string) => req(`/api/groups/${id}/messages/${gmsgId}`, { method: "PUT", body: JSON.stringify({ body }) }),
  groupRename: (id: string, name: string) => req(`/api/groups/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  groupAddMembers: (id: string, member_ids: string[]) => req(`/api/groups/${id}/members`, { method: "POST", body: JSON.stringify({ member_ids }) }),
  groupRemoveMember: (id: string, memberId: string) => req(`/api/groups/${id}/members/${memberId}`, { method: "DELETE" }),
  groupLeave: (id: string) => req(`/api/groups/${id}/leave`, { method: "POST" }),
  groupSetPin: (id: string, note: string) => req(`/api/groups/${id}/pin`, { method: "POST", body: JSON.stringify({ note }) }),
  groupsDiscover: () => req("/api/groups/discover"),
  groupJoin: (id: string) => req(`/api/groups/${id}/join`, { method: "POST" }),
  adminGroupRequests: () => req("/api/admin/group-requests"),
  adminGroupRequestDecide: (id: string, approve: boolean) => req(`/api/admin/group-requests/${id}/${approve ? "approve" : "decline"}`, { method: "POST" }),
  adminGroupJoinDecide: (id: string, approve: boolean) => req(`/api/admin/group-join-requests/${id}/${approve ? "approve" : "decline"}`, { method: "POST" }),
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
  adminCancelClass: (id: string, reason?: string, auto_return_passes?: boolean) =>
    req(`/api/admin/classes/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason: reason || "", auto_return_passes: auto_return_passes !== false }) }),
  adminRestoreClass: (id: string) => req(`/api/admin/classes/${id}/restore`, { method: "POST" }),
  adminRefunds: () => req("/api/admin/refunds"),
  adminResolveRefund: (booking_id: string, method: "credit" | "refunded" | "class_pass") =>
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
  adminMembershipLog: () => req("/api/admin/membership-log"),  membershipFormUrl: (application_id: string) => req(`/api/membership/forms/${application_id}/url`),
  adminSetApplicationStatus: (id: string, status: string) =>
    req(`/api/admin/applications/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  adminBookings: () => req("/api/admin/bookings"),
  adminBookingLog: (q?: string) => req(`/api/admin/booking-log${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  adminMembers: () => req("/api/admin/members"),
  exportMembers: () => req("/api/admin/members/export", { method: "POST" }),
  adminAcceptBooking: (id: string) => req(`/api/admin/bookings/${id}/accept`, { method: "POST" }),
  adminConfirmBooking: (id: string) => req(`/api/admin/bookings/${id}/confirm`, { method: "POST" }),
  adminCancelBooking: (id: string) => req(`/api/admin/bookings/${id}/cancel`, { method: "POST" }),
  adminRescheduleBooking: (id: string, new_time: string, note?: string, new_at?: string) =>
    req(`/api/admin/bookings/${id}/reschedule`, { method: "POST", body: JSON.stringify({ new_time, note, new_at }) }),
  adminSetAttendance: (id: string, attended: boolean) =>
    req(`/api/admin/bookings/${id}/attendance`, { method: "POST", body: JSON.stringify({ attended }) }),
  attendanceReport: () => req("/api/admin/attendance/report"),
  attendanceRoster: () => req("/api/admin/attendance/roster"),
  passesReport: () => req("/api/admin/passes/report"),
  adminWaitlists: () => req("/api/admin/waitlists"),
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
