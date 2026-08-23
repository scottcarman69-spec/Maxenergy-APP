import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, Text, TextInput, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/AuthContext";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Show notifications while the app is in the foreground too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Android must have a channel for notifications to display.
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {});
}

// Route to the screen a notification points at (from its data.action_url).
function handleNotificationNav(resp: Notifications.NotificationResponse | null) {
  const url = resp?.notification?.request?.content?.data?.action_url;
  if (url && typeof url === "string") {
    setTimeout(() => { try { router.push(url as any); } catch {} }, 400);
  }
}

// Apply DM Sans as the app-wide default text font (overridable per-style).
const AnyText = Text as any;
const AnyInput = TextInput as any;
AnyText.defaultProps = AnyText.defaultProps || {};
AnyText.defaultProps.style = [{ fontFamily: "DMSans-Medium" }, AnyText.defaultProps.style];
AnyInput.defaultProps = AnyInput.defaultProps || {};
AnyInput.defaultProps.style = [{ fontFamily: "DMSans-Medium" }, AnyInput.defaultProps.style];

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    DMSans: require("../assets/fonts/DMSans-Regular.ttf"),
    "DMSans-Medium": require("../assets/fonts/DMSans-Medium.ttf"),
    "DMSans-SemiBold": require("../assets/fonts/DMSans-SemiBold.ttf"),
    "DMSans-Bold": require("../assets/fonts/DMSans-Bold.ttf"),
    Anton: require("../assets/fonts/Anton-Regular.ttf"),
  });

  const loaded = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // Handle taps on a notification: cold-start (app opened from a notification)
  // and while running. Routes to the notification's action_url.
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (resp) handleNotificationNav(resp);
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationNav);
    return () => sub.remove();
  }, []);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.outer}>
          <StatusBar barStyle="light-content" backgroundColor={colors.surface} />
          <View style={styles.appFrame}>
            <AuthProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.surface },
                  animation: "fade",
                }}
              />
            </AuthProvider>
          </View>
        </View>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "#0A0A0B" : colors.surface,
    alignItems: "center",
  },
  appFrame: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: colors.surface,
    ...Platform.select({
      web: {
        maxWidth: 480,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.border,
      },
      default: {},
    }),
  },
});
