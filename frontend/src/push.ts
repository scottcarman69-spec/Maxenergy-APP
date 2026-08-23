import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { BACKEND_URL } from "@/src/api";

/**
 * Registers this device for push notifications and sends the native token to the
 * backend. Safe to call on every app open / login — tokens rotate and the backend
 * upserts. Never throws; push is best-effort and must not block the app.
 */
export async function registerForPush(user_id: string): Promise<void> {
  if (Platform.OS === "web" || !user_id) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BACKEND_URL}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch {
    // best-effort — ignore (e.g. Expo Go, no build, denied)
  }
}
