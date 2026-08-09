import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

export function PhotoCapture({
  value,
  onChange,
  testID,
}: {
  value: string | null; // data URI
  onChange: (dataUri: string | null) => void;
  testID?: string;
}) {
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const handleResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets?.length) {
      const a = result.assets[0];
      const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      onChange(uri);
      setNote(null);
    }
  };

  const takePhoto = async () => {
    setNote(null);
    const perm = await ImagePicker.getCameraPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (perm.canAskAgain) {
        const req = await ImagePicker.requestCameraPermissionsAsync();
        status = req.status;
      }
    }
    if (status !== "granted") {
      setBlocked(true);
      setNote("Camera access is needed to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
    });
    handleResult(result);
  };

  const pickPhoto = async () => {
    setNote(null);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (perm.canAskAgain) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = req.status;
      }
    }
    if (status !== "granted") {
      setBlocked(true);
      setNote("Photo library access is needed to choose a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      base64: true,
      quality: 0.5,
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    handleResult(result);
  };

  return (
    <View testID={testID}>
      {value ? (
        <View style={styles.previewWrap}>
          <Image source={value} style={styles.preview} contentFit="cover" />
          <Pressable testID={testID ? `${testID}-remove` : undefined} style={styles.removeBtn} onPress={() => onChange(null)}>
            <Ionicons name="close" size={16} color={colors.onSurface} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.btnRow}>
          <Pressable testID={testID ? `${testID}-camera` : undefined} style={styles.btn} onPress={takePhoto}>
            <Ionicons name="camera" size={20} color={colors.brand} />
            <Text style={styles.btnText}>Take Photo</Text>
          </Pressable>
          {Platform.OS !== "web" && (
            <Pressable testID={testID ? `${testID}-gallery` : undefined} style={styles.btn} onPress={pickPhoto}>
              <Ionicons name="images" size={20} color={colors.brand} />
              <Text style={styles.btnText}>Choose Photo</Text>
            </Pressable>
          )}
          {Platform.OS === "web" && (
            <Pressable testID={testID ? `${testID}-gallery` : undefined} style={styles.btn} onPress={pickPhoto}>
              <Ionicons name="images" size={20} color={colors.brand} />
              <Text style={styles.btnText}>Upload</Text>
            </Pressable>
          )}
        </View>
      )}
      {note && <Text style={styles.note}>{note}</Text>}
      {blocked && (
        <Pressable testID={testID ? `${testID}-settings` : undefined} style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
          <Ionicons name="settings-outline" size={14} color={colors.brand} />
          <Text style={styles.settingsText}>Open Settings</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  btnRow: { flexDirection: "row", gap: spacing.md },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
  },
  btnText: { color: colors.onSurface, fontWeight: "700" },
  previewWrap: { alignSelf: "flex-start" },
  preview: { width: 120, height: 120, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  removeBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { color: colors.warning, fontSize: 12, marginTop: spacing.sm },
  settingsBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  settingsText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
});
