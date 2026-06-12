import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Media, Playlist, PlaylistItemWithMedia } from "@signage/types";
import type { ConsoleSnapshot, DeviceWithAssignments } from "@/lib/console-sync";

export type { DeviceWithAssignments };

type ConsoleDataState = {
  ownerId: string | null;
  devices: DeviceWithAssignments[];
  playlists: Playlist[];
  media: Media[];
  playlistItemsByPlaylistId: Record<string, PlaylistItemWithMedia[]>;
  lastSyncedAt: number | null;
  isSyncing: boolean;
  syncError: string | null;
};

type ConsoleDataActions = {
  setOwnerId: (id: string | null) => void;
  applySnapshot: (ownerId: string, snapshot: ConsoleSnapshot, syncedAt: number) => void;
  patchDevice: (deviceId: string, patch: Partial<DeviceWithAssignments>) => void;
  setSyncing: (v: boolean) => void;
  setSyncError: (msg: string | null) => void;
  reset: () => void;
};

const emptyState = (): ConsoleDataState => ({
  ownerId: null,
  devices: [],
  playlists: [],
  media: [],
  playlistItemsByPlaylistId: {},
  lastSyncedAt: null,
  isSyncing: false,
  syncError: null,
});

export const useConsoleDataStore = create<ConsoleDataState & ConsoleDataActions>()(
  persist(
    (set) => ({
      ...emptyState(),
      setOwnerId: (ownerId) => set({ ownerId }),
      applySnapshot: (ownerId, snapshot, syncedAt) =>
        set({
          ownerId,
          devices: snapshot.devices,
          playlists: snapshot.playlists,
          media: snapshot.media,
          playlistItemsByPlaylistId: snapshot.playlistItemsByPlaylistId,
          lastSyncedAt: syncedAt,
          syncError: null,
        }),
      patchDevice: (deviceId, patch) =>
        set((s) => ({
          devices: s.devices.map((device) =>
            device.id === deviceId ? { ...device, ...patch } : device,
          ),
        })),
      setSyncing: (isSyncing) => set({ isSyncing }),
      setSyncError: (syncError) => set({ syncError }),
      reset: () => set(emptyState()),
    }),
    {
      name: "signage-console-cache-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        ownerId: s.ownerId,
        devices: s.devices,
        playlists: s.playlists,
        media: s.media,
        playlistItemsByPlaylistId: s.playlistItemsByPlaylistId,
        lastSyncedAt: s.lastSyncedAt,
      }),
    },
  ),
);

export function clearConsoleCachePersist() {
  useConsoleDataStore.getState().reset();
  try {
    localStorage.removeItem("signage-console-cache-v1");
  } catch {
    /* ignore */
  }
}
