import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, radius, font } from "@/src/theme";

const VIGYR_URL = "https://signon.vigyr.com/online-sign-on/form/CUSTOMER/75-MaxenergyFitness";

export default function VigyrSignOn() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const openExternal = () => {
    if (Platform.OS === "web") Linking.openURL(VIGYR_URL).catch(() => {});
    else WebBrowser.openBrowserAsync(VIGYR_URL).catch(() => Linking.openURL(VIGYR_URL).catch(() => {}));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="vigyr-back" hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Membership Sign-Up</Text>
          <Text style={styles.headerSub}>Official Maxenergy Fitness registration</Text>
        </View>
        <Pressable testID="vigyr-open-external" hitSlop={12} onPress={openExternal} style={styles.openBtn}>
          <Ionicons name="open-outline" size={16} color={colors.brand} />
          <Text style={styles.openText}>Browser</Text>
        </Pressable>
      </View>

      <View style={styles.webWrap}>
        {Platform.OS === "web" ? (
          // @ts-ignore iframe is valid on web
          <iframe
            title="Maxenergy Fitness Sign-On"
            src={VIGYR_URL}
            style={{ width: "100%", height: "100%", border: "none" }}
            onLoad={() => setLoading(false)}
          />
        ) : (
          <WebView
            ref={webRef}
            testID="vigyr-webview"
            source={{ uri: VIGYR_URL }}
            style={{ flex: 1, backgroundColor: "#fff" }}
            originWhitelist={["*"]}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setError(true); setLoading(false); }}
            onHttpError={() => setLoading(false)}
          />
        )}

        {loading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.loadingText}>Loading sign-up form…</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.onSurfaceSecondary} />
            <Text style={styles.errorTitle}>Couldn't load the form</Text>
            <Text style={styles.errorText}>Please check your connection and try again.</Text>
            <Pressable style={styles.retryBtn} onPress={openExternal}>
              <Ionicons name="open-outline" size={16} color={colors.onBrand} />
              <Text style={styles.retryText}>Open in browser</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { color: colors.onSurface, fontSize: 18, fontFamily: font.heading },
  headerSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  openBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  openText: { color: colors.brand, fontSize: 12.5, fontWeight: "800" },
  webWrap: { flex: 1, backgroundColor: "#fff" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.md },
  loadingText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  errorOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.sm, padding: spacing.xl },
  errorTitle: { color: colors.onSurface, fontSize: 17, fontFamily: font.heading, marginTop: spacing.sm },
  errorText: { color: colors.onSurfaceSecondary, fontSize: 13.5, textAlign: "center" },
  retryBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, backgroundColor: colors.brand, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md },
  retryText: { color: colors.onBrand, fontWeight: "800" },
});
