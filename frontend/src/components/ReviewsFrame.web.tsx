import React from "react";
import { colors } from "@/src/theme";

type Props = {
  uri: string;
  onLoaded: () => void;
  onFailed: () => void;
  onSummary?: (rating: number, total: number) => void;
};

// Web build: react-native-webview has no web implementation, so render a real
// iframe. Links inside the Elfsight widget open in a new browser tab.
export default function ReviewsFrame({ uri, onLoaded }: Props) {
  return (
    <iframe
      title="Maxenergy Fitness Reviews"
      src={uri}
      onLoad={onLoaded}
      style={{ flex: 1, border: "none", width: "100%", height: "100%", backgroundColor: colors.surface }}
    />
  );
}
