import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, radius, font } from "@/src/theme";

const PAGES = [
  { key: "fitness", label: "Max Energy Fitness", url: "https://www.facebook.com/MaxEnergyFitness" },
  { key: "combat", label: "Combat Club", url: "https://www.facebook.com/profile.php?id=61561343624470" },
];

const FEED_HEIGHT = 480;

function pluginUri(pageUrl: string) {
  const href = encodeURIComponent(pageUrl);
  return (
    `https://www.facebook.com/plugins/page.php?href=${href}` +
    `&tabs=timeline&width=500&height=${FEED_HEIGHT}` +
    `&small_header=false&adapt_container_width=true&hide_cover=false&show_facepile=true`
  );
}

export default function FacebookFeed() {
  const [active, setActive] = useState(PAGES[0]);

  const openPage = async () => {
    try {
      await WebBrowser.openBrowserAsync(active.url);
    } catch {
      Linking.openURL(active.url);
    }
  };

  const uri = pluginUri(active.url);

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {PAGES.map((p) => (
          <Pressable
            key={p.key}
            testID={`fb-tab-${p.key}`}
            style={[styles.tab, active.key === p.key && styles.tabOn]}
            onPress={() => setActive(p)}
          >
            <Ionicons name="logo-facebook" size={14} color={active.key === p.key ? colors.onBrand : colors.brand} />
            <Text style={[styles.tabText, active.key === p.key && styles.tabTextOn]} numberOfLines={1}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.feedCard}>
        {Platform.OS === "web" ? (
          // react-native-web: render the plugin directly as an iframe
          // @ts-ignore - iframe is valid on web
          <iframe
            title={active.label}
            src={uri}
            style={{ width: "100%", height: FEED_HEIGHT, border: "none", borderRadius: radius.md }}
            scrolling="no"
            frameBorder="0"
            allowFullScreen
          />
        ) : (
          <WebView
            testID="fb-webview"
            source={{ uri }}
            style={{ height: FEED_HEIGHT, backgroundColor: "transparent" }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scrollEnabled
            setSupportMultipleWindows={false}
          />
        )}
      </View>

      <Pressable testID="fb-open-page" style={styles.openBtn} onPress={openPage}>
        <Ionicons name="logo-facebook" size={16} color={colors.onBrand} />
        <Text style={styles.openText}>Open {active.label} on Facebook</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: "row", gap: spacing.sm },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { color: colors.onSurface, fontWeight: "800", fontSize: 12, flexShrink: 1 },
  tabTextOn: { color: colors.onBrand },
  feedCard: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brand,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  openText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 },
});
