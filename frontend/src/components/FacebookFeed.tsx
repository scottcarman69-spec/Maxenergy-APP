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

const FEED_HEIGHT = 620;
// We render the plugin inside our own HTML (mobile) so we control the viewport
// and let FB adapt to the container width — otherwise the raw plugin URL renders
// at the device's physical-pixel width and looks half-size. We ask for a tall-ish
// plugin so a few posts load, then shrink the WebView to the measured content.
const PLUGIN_HEIGHT = 1100;
const MIN_H = 520;
const MAX_H = 1800;

function pluginUri(pageUrl: string, width: number) {
  const w = Math.max(180, Math.min(500, Math.round(width))); // FB plugin supports 180-500
  const href = encodeURIComponent(pageUrl);
  return (
    `https://www.facebook.com/plugins/page.php?href=${href}` +
    `&tabs=timeline&width=${w}&height=${FEED_HEIGHT}` +
    `&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=false`
  );
}

function pluginHtml(pageUrl: string) {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;background:#fff;overflow:hidden;}
  .fb-page,.fb-page > span,.fb-page iframe{width:100% !important;}
</style></head><body>
<div id="fb-root"></div>
<div class="fb-page"
  data-href="${pageUrl}"
  data-tabs="timeline"
  data-width="500"
  data-height="${PLUGIN_HEIGHT}"
  data-small-header="true"
  data-adapt-container-width="true"
  data-hide-cover="true"
  data-show-facepile="false"></div>
<script>
  function rep(){try{var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);if(h&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(String(h));}}catch(e){}}
  window.fbAsyncInit=function(){try{FB.init({xfbml:true,version:'v19.0'});FB.Event.subscribe('xfbml.render',function(){setTimeout(rep,300);setTimeout(rep,1400);});}catch(e){}};
  (function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(d.getElementById(id))return;js=d.createElement(s);js.id=id;js.src="https://connect.facebook.net/en_US/sdk.js";fjs.parentNode.insertBefore(js,fjs);}(document,'script','facebook-jssdk'));
  [1500,3000,5000,7500].forEach(function(t){setTimeout(rep,t);});
  window.addEventListener('load',rep);
</script></body></html>`;
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
        {Platform.OS === "web" ? (
          uri ? (
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
            <View style={{ height: FEED_HEIGHT }} />
          )
        ) : (
          <WebView
            key={active.key}
            testID="fb-webview"
            source={{ html: pluginHtml(active.url), baseUrl: "https://www.facebook.com" }}
            originWhitelist={["*"]}
            style={{ width: "100%", height: mobileHeight, backgroundColor: "#fff" }}
            onMessage={onWebMessage}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            scrollEnabled={false}
            nestedScrollEnabled
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
