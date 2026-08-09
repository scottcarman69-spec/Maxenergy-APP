import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, StatusBar, View, Text, TextInput, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/AuthContext";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

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

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
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
