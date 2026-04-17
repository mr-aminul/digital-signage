"use client";

import type { Device } from "@signage/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface PlaylistOption {
  id: string;
  name: string;
}

type DeviceWithAssignments = Device & {
  device_playlists: Array<{ playlist_id: string; is_active: boolean }> | null;
};

interface DevicesManagerProps {
  userId: string;
  initialDevices: DeviceWithAssignments[];
  playlists: PlaylistOption[];
}

export function DevicesManager({ userId, initialDevices, playlists }: DevicesManagerProps) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [devices, setDevices] = useState<DeviceWithAssignments[]>(initialDevices);
  const [pairingCode, setPairingCode] = useState("");
  const [friendlyName, setFriendlyName] = useState("");
  const [linking, setLinking] = useState(false);

  const refreshDevices = useCallback(async () => {
    const { data, error } = await supabase
      .from("devices")
      .select("*, device_playlists(playlist_id,is_active)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDevices((data as DeviceWithAssignments[]) ?? []);
  }, [supabase, userId]);

  useEffect(() => {
    const channel = supabase
      .channel("devices-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices", filter: `owner_id=eq.${userId}` },
        () => {
          void refreshDevices();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, refreshDevices]);

  async function linkDevice() {
    setLinking(true);
    try {
      const code = pairingCode.trim();
      if (!/^[0-9]{6}$/.test(code)) {
        toast.error("Pairing code must be exactly 6 digits.");
        return;
      }
      const { data, error } = await supabase.rpc("link_device_by_pairing_code", {
        p_code: code,
        p_name: friendlyName.trim() || null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Linked device ${(data as Device).name}`);
      setPairingCode("");
      setFriendlyName("");
      await refreshDevices();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to link device";
      toast.error(message);
    } finally {
      setLinking(false);
    }
  }

  async function renameDevice(id: string, name: string) {
    const { error } = await supabase.from("devices").update({ name }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Device renamed");
    await refreshDevices();
  }

  async function deleteDevice(id: string) {
    const { error } = await supabase.from("devices").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Device removed");
    await refreshDevices();
  }

  async function setActivePlaylist(deviceId: string, playlistId: string) {
    const { error } = await supabase.from("device_playlists").upsert(
      {
        device_id: deviceId,
        playlist_id: playlistId,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id,playlist_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    const { error: deactivateError } = await supabase
      .from("device_playlists")
      .update({ is_active: false })
      .eq("device_id", deviceId)
      .neq("playlist_id", playlistId);
    if (deactivateError) {
      toast.error(deactivateError.message);
      return;
    }
    toast.success("Playlist assigned");
    await refreshDevices();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the six-digit code shown on the TV (after it signs in anonymously). Status updates stream over Realtime.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Link a TV</CardTitle>
          <CardDescription>The Android app registers the code first; you claim it here.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="code">Pairing code</Label>
            <Input
              id="code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
            />
          </div>
          <div className="space-y-2 md:col-span-1">
            <Label htmlFor="friendly">Display name</Label>
            <Input
              id="friendly"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="Lobby screen"
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void linkDevice()} disabled={linking}>
              {linking ? "Linking…" : "Link device"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {devices.length === 0 ? (
          <Card className="border-dashed border-border bg-card/60">
            <CardHeader>
              <CardTitle>No devices yet</CardTitle>
              <CardDescription>Launch the TV app, note the pairing code, then link it from this page.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          devices.map((device) => {
            const activePlaylistId =
              device.device_playlists?.find((row) => row.is_active)?.playlist_id ?? "";
            return (
              <DeviceRow
                key={device.id}
                device={device}
                activePlaylistId={activePlaylistId}
                playlists={playlists}
                onRename={(name) => void renameDevice(device.id, name)}
                onDelete={() => void deleteDevice(device.id)}
                onAssign={(playlistId) => void setActivePlaylist(device.id, playlistId)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  activePlaylistId,
  playlists,
  onRename,
  onDelete,
  onAssign,
}: {
  device: Device;
  activePlaylistId: string;
  playlists: PlaylistOption[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onAssign: (playlistId: string) => void;
}) {
  const [name, setName] = useState(device.name);

  useEffect(() => {
    setName(device.name);
  }, [device.name]);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-xl">{device.name}</CardTitle>
          <CardDescription>
            Status: <span className="font-medium text-foreground">{device.status}</span> · Last seen:{" "}
            {device.last_seen ? new Date(device.last_seen).toLocaleString() : "—"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor={`name-${device.id}`}>Name</Label>
            <div className="flex gap-2">
              <Input id={`name-${device.id}`} value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" variant="secondary" onClick={() => onRename(name)}>
                Save
              </Button>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor={`playlist-${device.id}`}>Active playlist</Label>
            <select
              id={`playlist-${device.id}`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={activePlaylistId}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                onAssign(value);
              }}
            >
              <option value="">Select playlist…</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Device ID: {device.id}</p>
      </CardContent>
    </Card>
  );
}
