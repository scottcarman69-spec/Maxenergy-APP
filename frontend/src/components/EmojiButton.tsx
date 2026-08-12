import React, { useState } from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import EmojiPicker from "rn-emoji-keyboard";
import { colors } from "@/src/theme";

type Props = { onPick: (emoji: string) => void; testID?: string };

/** A smiley button that opens an emoji picker and returns the chosen emoji. */
export default function EmojiButton({ onPick, testID }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        testID={testID}
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        <Ionicons name="happy-outline" size={24} color={colors.onSurfaceSecondary} />
      </Pressable>
      <EmojiPicker
        open={open}
        onClose={() => setOpen(false)}
        onEmojiSelected={(e) => onPick(e.emoji)}
        enableSearchBar
        categoryPosition="top"
        theme={{
          backdrop: "#00000099",
          knob: colors.brand,
          container: colors.surface,
          header: colors.onSurface,
          skinTonesContainer: colors.surfaceSecondary,
          category: {
            icon: colors.onSurfaceSecondary,
            iconActive: colors.onBrand,
            container: colors.surfaceSecondary,
            containerActive: colors.brand,
          },
          search: {
            text: colors.onSurface,
            placeholder: colors.onSurfaceSecondary,
            icon: colors.onSurfaceSecondary,
            background: colors.surfaceSecondary,
          },
          emoji: { selected: colors.brandTertiary },
        }}
      />
    </>
  );
}
