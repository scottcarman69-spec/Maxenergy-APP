import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@/src/theme";

type Props = {
  uri: string;
  onLoaded: () => void;
  onFailed: () => void;
};

// Hosts the WebView is allowed to load inside the app. Anything else (e.g. a
// member tapping "View on Google" / a reviewer's profile) opens in the system
// browser instead of hijacking the widget view.
function isInternal(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("about:") || url.startsWith("data:")) return true;
  const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
  if (base && url.startsWith(base)) return true;
  return /https?:\/\/[^/]*elfsight\.com/i.test(url);
}

export default function ReviewsFrame({ uri, onLoaded, onFailed }: Props) {
  const webRef = useRef<WebView>(null);

  const onNavRequest = (req: WebViewNavigation): boolean => {
    if (isInternal(req.url)) return true;
    WebBrowser.openBrowserAsync(req.url).catch(() => {});
    return false;
  };

  return (
    <WebView
      ref={webRef}
      testID="reviews-webview"
      source={{ uri }}
      style={styles.web}
      containerStyle={{ backgroundColor: colors.surface }}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onNavRequest}
      onLoad={onLoaded}
      onLoadEnd={onLoaded}
      onError={onFailed}
      onHttpError={onLoaded}
      startInLoadingState={false}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.surface },
});
