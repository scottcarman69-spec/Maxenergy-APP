import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView, WebViewNavigation } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import { colors } from "@/src/theme";

type Props = {
  uri: string;
  onLoaded: () => void;
  onFailed: () => void;
  onSummary?: (rating: number, total: number) => void;
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

// Scrape the rating + review count the Elfsight widget rendered and post it back
// to the app so the Home summary card can stay in sync. Polls because the widget
// loads asynchronously.
const SCRAPE_JS = `
(function(){
  function parse(){
    try{
      var el=document.querySelector('.elfsight-app-d2cd5c7f-942e-4d68-85d7-41e53e623d34');
      if(!el) return false;
      var t=el.innerText||'';
      var r=t.match(/\\b([0-5]\\.\\d)\\b/);
      var n=t.match(/\\((\\d+)\\)/);
      if(r&&n){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'reviews_summary',rating:parseFloat(r[1]),total:parseInt(n[1],10)}));
        return true;
      }
    }catch(e){}
    return false;
  }
  var tries=0;
  var iv=setInterval(function(){tries++;if(parse()||tries>25){clearInterval(iv);}},1000);
})();
true;
`;

export default function ReviewsFrame({ uri, onLoaded, onFailed, onSummary }: Props) {
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
      injectedJavaScript={SCRAPE_JS}
      onMessage={(e) => {
        try {
          const d = JSON.parse(e.nativeEvent.data);
          if (d?.type === "reviews_summary" && typeof d.rating === "number" && typeof d.total === "number") {
            onSummary?.(d.rating, d.total);
          }
        } catch {}
      }}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: colors.surface },
});
