import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Linking, TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from "react-native-draggable-flatlist";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Photo = { photo_id: string; image: string; caption?: string };

export default function AdminGymPhotos() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [captions, setCaptions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await api.gymGalleryPhotos();
      const list: Photo[] = r?.photos || [];
      setPhotos(list);
      setCaptions(Object.fromEntries(list.map((p) => [p.photo_id, p.caption || ""])));
    } catch {}
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveCaption = async (photo_id: string) => {
    const current = photos.find((p) => p.photo_id === photo_id)?.caption || "";
    const next = (captions[photo_id] ?? "").trim();
    if (next === current) return;
    try {
      await api.adminSetGymCaption(photo_id, next);
      setPhotos((ps) => ps.map((p) => (p.photo_id === photo_id ? { ...p, caption: next } : p)));
    } catch (e: any) {
      Alert.alert("Couldn't save caption", e?.message || "Please try again.");
    }
  };

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
    try { await api.adminAddGymPhoto(dataUri); await load(); }
    catch (e: any) { Alert.alert("Couldn't add photo", e?.message || "Please try a smaller image."); }
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

  const onDragEnd = async ({ data }: { data: Photo[] }) => {
    setPhotos(data);
    setSavingOrder(true);
    try { await api.adminReorderGymPhotos(data.map((p) => p.photo_id)); }
    catch { load(); }
    setSavingOrder(false);
  };

  const renderItem = ({ item, drag, isActive, getIndex }: RenderItemParams<Photo>) => {
    const idx = getIndex();
    return (
      <ScaleDecorator>
        <View style={[styles.card, isActive && styles.cardActive]} testID={`gymphoto-${item.photo_id}`}>
          <View style={styles.row}>
            <Pressable onLongPress={drag} delayLongPress={150} style={styles.handle} testID={`gymphoto-drag-${item.photo_id}`} hitSlop={8}>
              <Ionicons name="reorder-three" size={26} color={colors.onSurfaceSecondary} />
            </Pressable>
            {typeof idx === "number" && <Text style={styles.pos}>{idx + 1}</Text>}
            <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1 }} />
            <Pressable
              testID={`gymphoto-del-${item.photo_id}`}
              style={styles.delBtn}
              onPress={() => removePhoto(item.photo_id)}
              disabled={deleting === item.photo_id}
              hitSlop={8}
            >
              {deleting === item.photo_id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="trash" size={16} color="#fff" />}
            </Pressable>
          </View>
          <TextInput
            testID={`gymphoto-caption-${item.photo_id}`}
            style={styles.captionInput}
            placeholder="Add a caption (optional)…"
            placeholderTextColor={colors.onSurfaceSecondary}
            value={captions[item.photo_id] ?? ""}
            onChangeText={(t) => setCaptions((c) => ({ ...c, [item.photo_id]: t }))}
            onBlur={() => saveCaption(item.photo_id)}
            onSubmitEditing={() => saveCaption(item.photo_id)}
            returnKeyType="done"
            maxLength={120}
          />
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScreenHeader
        title="Gym Gallery Photos"
        backTestID="gymphotos-back"
        fallback="/admin"
        right={savingOrder ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
      />
      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <DraggableFlatList
          data={photos}
          keyExtractor={(p) => p.photo_id}
          renderItem={renderItem}
          onDragEnd={onDragEnd}
          activationDistance={12}
          containerStyle={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
          ListHeaderComponent={
            <View>
              <Text style={styles.intro}>These photos appear in the “OUR GYM” gallery on the Home screen. Drag the handle to reorder, and changes go live for members instantly — no app update needed.</Text>
              <Pressable testID="gymphotos-add" style={[styles.addBtn, uploading && { opacity: 0.6 }]} onPress={addPhoto} disabled={uploading}>
                {uploading ? <ActivityIndicator color={colors.onBrand} /> : (
                  <>
                    <Ionicons name="add-circle" size={20} color={colors.onBrand} />
                    <Text style={styles.addText}>ADD A PHOTO</Text>
                  </>
                )}
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={44} color={colors.onSurfaceSecondary} />
              <Text style={styles.emptyText}>No gallery photos yet. Tap “Add a photo” to build your gallery.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  intro: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.md, marginBottom: spacing.lg },
  addText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.md },
  cardActive: { borderColor: colors.brand, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  handle: { paddingHorizontal: 2 },
  pos: { color: colors.brand, fontWeight: "900", fontSize: 15, width: 18, textAlign: "center" },
  thumb: { width: 84, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  captionInput: { marginTop: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 9, color: colors.onSurface, fontSize: 13.5 },
  delBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(220,38,38,0.92)", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: spacing.md },
  emptyText: { color: colors.onSurfaceSecondary, textAlign: "center", lineHeight: 21 },
});
