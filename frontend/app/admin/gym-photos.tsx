import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Linking, Dimensions } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Photo = { photo_id: string; image: string };

const COL_GAP = spacing.md;
const TILE = Math.floor((Math.min(Dimensions.get("window").width, 480) - spacing.lg * 2 - COL_GAP) / 2) - 1;

export default function AdminGymPhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.gymGalleryPhotos();
      setPhotos(r?.photos || []);
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addPhoto = async () => {
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        Alert.alert("Photo access needed", "Enable photo access to add gym gallery photos.", [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const dataUri = `data:image/jpeg;base64,${res.assets[0].base64}`;
    setUploading(true);
    try {
      await api.adminAddGymPhoto(dataUri);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't add photo", e?.message || "Please try a smaller image.");
    }
    setUploading(false);
  };

  const removePhoto = (photo_id: string) => {
    Alert.alert("Remove photo?", "This removes it from the OUR GYM gallery for all members.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          setDeleting(photo_id);
          try { await api.adminDeleteGymPhoto(photo_id); await load(); }
          catch (e: any) { Alert.alert("Couldn't remove", e?.message || "Please try again."); }
          setDeleting(null);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader title="Gym Gallery Photos" backTestID="gymphotos-back" fallback="/admin" />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <Text style={styles.intro}>These photos appear in the “OUR GYM” gallery on the Home screen. Changes are live for members instantly — no app update needed.</Text>

          <Pressable testID="gymphotos-add" style={[styles.addBtn, uploading && { opacity: 0.6 }]} onPress={addPhoto} disabled={uploading}>
            {uploading ? <ActivityIndicator color={colors.onBrand} /> : (
              <>
                <Ionicons name="add-circle" size={20} color={colors.onBrand} />
                <Text style={styles.addText}>ADD A PHOTO</Text>
              </>
            )}
          </Pressable>

          {photos.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={44} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No gallery photos yet. Tap “Add a photo” to build your gallery.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {photos.map((p) => (
                <View key={p.photo_id} style={styles.tile} testID={`gymphoto-${p.photo_id}`}>
                  <Image source={{ uri: p.image }} style={styles.tileImg} contentFit="cover" />
                  <Pressable
                    testID={`gymphoto-del-${p.photo_id}`}
                    style={styles.delBtn}
                    onPress={() => removePhoto(p.photo_id)}
                    disabled={deleting === p.photo_id}
                    hitSlop={8}
                  >
                    {deleting === p.photo_id
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Ionicons name="trash" size={16} color="#fff" />}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          {photos.length > 0 && (
            <Text style={styles.count}>{photos.length} photo{photos.length === 1 ? "" : "s"} in the gallery</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginBottom: spacing.lg },
  addText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: COL_GAP },
  tile: { width: TILE, height: TILE * 1.2, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  tileImg: { width: "100%", height: "100%" },
  delBtn: { position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(220,38,38,0.92)", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 21 },
  count: { color: colors.onSurfaceSecondary, fontSize: 12, textAlign: "center", marginTop: spacing.lg },
});
