"use client";

import type { Device } from "@signage/types";
import { Tv } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useConsoleSync } from "@/components/console/console-sync-provider";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function DevicePlaybackToggle({ device }: { device: Device }) {
  const supabase = getSupabaseBrowserClient();
  const { syncNow } = useConsoleSync();
  const [busy, setBusy] = useState(false);
  const disabled = Boolean(device.playback_disabled);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      const next = !disabled;
      const { error } = await supabase.from("devices").update({ playback_disabled: next }).eq("id", device.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(next ? "Playlist paused on this screen" : "Playlist resumed on this screen");
      await syncNow();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update screen");
    } finally {
      setBusy(false);
    }
  }, [device.id, disabled, supabase, syncNow]);

  return (
    <Button
      type="button"
      variant={disabled ? "default" : "outline"}
      size="sm"
      className="gap-2"
      disabled={busy}
      title={
        disabled
          ? "Turn playlist playback back on for this TV"
          : "Pause playlist on this TV (TV shows a standby screen)"
      }
      onClick={() => void toggle()}
    >
      <Tv className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      {busy ? "Updating…" : disabled ? "Resume playlist on TV" : "Pause playlist on TV"}
    </Button>
  );
}
