import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking, LayoutChangeEvent } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { colors, spacing, radius, font } from "@/src/theme";

const PAGES = [
  { key: "fitness", label: "Max Energy Fitness", url: "https://www.facebook.com/MaxEnergyFitness" },
  { key: "combat", label: "Combat Club", url: "https://www.facebook.com/profile.php?id=61561343624470" },
];

const FEED_HEIGHT = 460;
// We ask FB for a tall plugin so it renders several posts, then we shrink the
// WebView down to the ACTUAL rendered content height (measured via injected JS)
// so there's no big white gap underneath.
const PLUGIN_HEIGHT = 1300;
const MIN_H = 260;
const MAX_H = 1600;

const MEASURE_JS = `
(function(){
  function report(){
    try{
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      if(h && window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(String(h)); }
    }catch(e){}
  }
  report();
  [300,700,1200,2000,3200,5000].forEach(function(t){ setTimeout(report,t); });
  window.addEventListener('load', report);
  try{ if(window.ResizeObserver){ new ResizeObserver(report).observe(document.body); } }catch(e){}
})(); true;
`;

function pluginUri(pageUrl: string, width: number) {
  const w = Math.max(180, Math.min(500, Math.round(width))); // FB plugin supports 180-500
  const href = encodeURIComponent(pageUrl);
  return (
    `https://www.facebook.com/plugins/page.php?href=${href}` +
    `&tabs=timeline&width=${w}&height=${PLUGIN_HEIGHT}` +
    `&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false`
  );
}

export default function FacebookFeed() {
  const [active, setActive] = useState(PAGES[0]);
  const [width, setWidth] = useState(0);
  const [contentH, setContentH] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w && Math.abs(w - width) > 1) setWidth(w);
  };

  const selectPage = (p: (typeof PAGES)[number]) => {
    setContentH(null);
    setActive(p);
  };

  const onWebMessage = (e: any) => {
    const h = parseInt(e?.nativeEvent?.data, 10);
    if (h && !isNaN(h)) setContentH(Math.max(MIN_H, Math.min(MAX_H, h)));
  };

  const openPage = async () => {
    try {
      await WebBrowser.openBrowserAsync(active.url);
    } catch {
      Linking.openURL(active.url);
    }
  };

  const uri = width ? pluginUri(active.url, width) : null;
  const plugW = Math.max(180, Math.min(500, Math.round(width)));
  // The FB plugin is hard-capped at 500px wide. On wider (desktop/web) boxes we
  // scale the iframe up so it fills the container instead of leaving white space.
  const scale = width && plugW ? Math.max(1, width / plugW) : 1;
  const scaledHeight = Math.round(FEED_HEIGHT * scale);
  const mobileHeight = contentH ?? FEED_HEIGHT;

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        {PAGES.map((p) => (
          <Pressable
            key={p.key}
            testID={`fb-tab-${p.key}`}
            style={[styles.tab, active.key === p.key && styles.tabOn]}
            onPress={() => selectPage(p)}
          >
            <Ionicons name="logo-facebook" size={14} color={active.key === p.key ? colors.onBrand : colors.brand} />
            <Text style={[styles.tabText, active.key === p.key && styles.tabTextOn]} numberOfLines={1}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.feedCard} onLayout={onLayout}>
        {uri ? (
          Platform.OS === "web" ? (
            // @ts-ignore - div/iframe are valid on web
            <div style={{ width: "100%", height: scaledHeight, overflow: "hidden" }}>
              {/* @ts-ignore - iframe is valid on web */}
              <iframe
                key={active.key + plugW}
                title={active.label}
                src={uri}
                style={{
                  width: plugW,
                  height: FEED_HEIGHT,
                  border: "none",
                  display: "block",
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
                scrolling="yes"
                frameBorder="0"
                allowFullScreen
              />
            </div>
          ) : (
            <WebView
              key={active.key + plugW}
              testID="fb-webview"
              source={{ uri }}
              style={{ width: "100%", height: mobileHeight, backgroundColor: "#fff" }}
              injectedJavaScript={MEASURE_JS}
              onMessage={onWebMessage}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scrollEnabled={false}
              nestedScrollEnabled
              setSupportMultipleWindows={false}
            />
          )
        ) : (
          <View style={{ height: FEED_HEIGHT }} />
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
    width: "100%",
    alignSelf: "stretch",
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
