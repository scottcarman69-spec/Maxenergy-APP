import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api";
import { gymPhotos as bundledGymPhotos } from "@/src/gymPhotos";

export type GymImageSource = number | { uri: string };
export type GymGalleryItem = { source: GymImageSource; caption?: string; featured?: boolean };

const bundledItems: GymGalleryItem[] = bundledGymPhotos.map((s) => ({ source: s, caption: "" }));

/**
 * Resolves the OUR GYM gallery. Returns admin-managed photos (with captions) from the
 * backend when available, otherwise falls back to the bundled default images.
 */
export function useGymGallery(): GymGalleryItem[] {
  const [items, setItems] = useState<GymGalleryItem[]>(bundledItems);

  const load = useCallback(async () => {
    try {
      const r = await api.gymGalleryPhotos();
      const photos = r?.photos || [];
      setItems(
        photos.length > 0
          ? photos.map((p: { image: string; caption?: string; featured?: boolean }) => ({ source: { uri: p.image }, caption: p.caption || "", featured: !!p.featured }))
          : bundledItems
      );
    } catch {
      // keep whatever we have (bundled defaults)
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return items;
}
