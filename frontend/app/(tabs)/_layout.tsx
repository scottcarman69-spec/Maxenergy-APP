import React, { useCallback, useEffect, useState } from "react";
import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { Platform, AppState } from "react-native";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";

export default function TabsLayout() {
  const { user } = useAuth();
  const segments = useSegments();
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [m, n] = await Promise.all([api.unreadMessages(), api.unreadNotifications()]);
      setUnread(m.count || 0);
      setAlerts(n.count || 0);
    } catch {}
  }, [user]);

  // Poll for unread gym replies + refresh when tab context / app state changes.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => { clearInterval(id); sub.remove(); };
  }, [refresh]);

  // Re-check whenever navigation changes (e.g. returning from the Messages screen).
  useEffect(() => { refresh(); }, [segments, refresh]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.select({ ios: 84, android: 64, web: 74 }),
          paddingTop: 8,
          paddingBottom: Platform.select({ ios: 24, android: 8, web: 14 }),
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: "Timetable",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Notices",
          tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 10, fontWeight: "900" },
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
          tabBarBadge: alerts > 0 ? alerts : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 10, fontWeight: "900" },
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
