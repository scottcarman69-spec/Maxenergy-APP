import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { gymPhotos as bundledGymPhotos } from "@/src/gymPhotos";

export type GymImageSource = number | { uri: string };

/**
 * Resolves the OUR GYM gallery. Returns admin-managed photos from the backend when
 * available, otherwise falls back to the bundled default images. Each item is a valid
 * React Native Image `source` (a require() module number or a { uri } object).
 */
export function useGymGallery(): GymImageSource[] {
  const [images, setImages] = useState<GymImageSource[]>(bundledGymPhotos);

  const load = useCallback(async () => {
    try {
      const r = await api.gymGalleryPhotos();
      const photos = r?.photos || [];
      setImages(photos.length > 0 ? photos.map((p: { image: string }) => ({ uri: p.image })) : bundledGymPhotos);
    } catch {
      // keep whatever we have (bundled defaults)
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return images;
}
