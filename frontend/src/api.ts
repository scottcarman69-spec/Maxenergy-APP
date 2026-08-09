import { storage } from "@/src/utils/storage";

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "auth_token";

export type User = {
  user_id: string;
  email: string;
  name?: string | null;
  picture?: string | null;
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
    const msg = (data && data.detail) || `Request failed (${res.status})`;
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
  logout: () => req("/api/auth/logout", { method: "POST" }),

  classes: () => req("/api/classes"),
  classDetail: (id: string) => req(`/api/classes/${id}`),
  createBooking: (class_id: string) =>
    req("/api/bookings", { method: "POST", body: JSON.stringify({ class_id }) }),
  myBookings: () => req("/api/bookings"),

  checkout: (booking_id: string, origin_url: string) =>
    req("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ booking_id, origin_url }),
    }),
  paymentStatus: (session_id: string) => req(`/api/payments/status/${session_id}`),

  events: () => req("/api/events"),
  eventDetail: (id: string) => req(`/api/events/${id}`),
  rsvp: (event_id: string) =>
    req("/api/events/rsvp", { method: "POST", body: JSON.stringify({ event_id }) }),

  notifications: () => req("/api/notifications"),
  markRead: (id: string) => req(`/api/notifications/${id}/read`, { method: "POST" }),
};

export const BACKEND_URL = API_URL;
