export function DeviceDisabledNotice({ canControlPlayback = false }: { canControlPlayback?: boolean }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      {canControlPlayback ? (
        <p>
          This device has been disabled. Select <span className="font-medium">Enable Device</span> to turn it
          back on.
        </p>
      ) : (
        <p>
          This device has been disabled by an administrator. Contact your administrator if you need it
          restored.
        </p>
      )}
    </div>
  );
}

export function DeviceDisabledBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
      Disabled
    </span>
  );
}

export function isDevicePlaybackDisabled(device: { playback_disabled?: boolean | null }): boolean {
  return Boolean(device.playback_disabled);
}
