import React, { useCallback, useEffect, useState } from "react";
import { Tabs, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { Platform, AppState, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/AuthContext";

// Fixed-size, non-scaling tab labels so they never truncate on devices with a
// large system font scale.
const tabLabel = (text: string) =>
  ({ color }: { color: string }) => (
    <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.2, color, marginTop: 1 }}>
      {text}
    </Text>
  );

export default function TabsLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
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
          // Add the device's bottom safe-area inset so the tab bar sits ABOVE the
          // Android system navigation bar / iOS home indicator (prevents overlap).
          height: (Platform.OS === "web" ? 60 : 60) + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 14 : 10),
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceSecondary,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarLabel: tabLabel("Home"),
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timetable"
        options={{
          title: "Timetable",
          tabBarLabel: tabLabel("Classes"),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Notices",
          tabBarLabel: tabLabel("Notices"),
          tabBarIcon: ({ color, size }) => <Ionicons name="megaphone" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Inbox",
          tabBarLabel: tabLabel("Inbox"),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" size={size} color={color} />,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 10, fontWeight: "900" },
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarLabel: tabLabel("Alerts"),
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
          tabBarBadge: alerts > 0 ? alerts : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.brand, color: colors.onBrand, fontSize: 10, fontWeight: "900" },
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="reviews"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: tabLabel("Profile"),
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
