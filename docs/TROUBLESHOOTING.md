# Troubleshooting

## A library root is offline or empty

Reconnect or remount the drive with the same path, then rescan the root. Bebop deliberately keeps
offline roots and marks missing tracks unavailable. Use catalog cleanup only when the missing rows
should be permanently removed. On network filesystems, prefer an explicit full rescan because OS
watchers can miss events.

## A file plays but its metadata is missing

Malformed and untagged files use the filename, `Unknown Artist`, and `Unknown Album`. Confirm the
format is one of FLAC, WAV, MP3, Ogg Vorbis, AAC, AIFF, or M4A/ALAC, then edit a database draft.
Writing that draft into the file is a separate reviewed action. Read-only, active, unsupported, and
out-of-root files are intentionally rejected.

## Playback reports resampling or a missing output device

Reconnect the device and select it again in Settings. Bebop falls back to the system default after
device loss. Hi-fi mode requests a native rate and unity software gain, but shared PipeWire,
PulseAudio, and Windows output can still process audio; native rate alone is not proof of a
bit-perfect path.

## An integration is unavailable

Local playback is independent of every integration. Last.fm needs release application credentials
and a user session. Discord needs the desktop client and release application identifier. slskd must
be installed separately and reachable; non-loopback endpoints require HTTPS and confirmation.
Errors stay visible in Settings and persisted outboxes retry only where safe.

## An update fails

Check network access to the GitHub release endpoint. Bebop refuses artifacts without a valid Tauri
updater signature. Stable Windows installers also require valid Authenticode signing. Download or
installation begins only after confirmation; a failed check never interrupts playback.

## The catalog database is damaged

On the next startup, Bebop preserves corrupt database files under `database-recovery/` and creates
a clean catalog. Follow [backup and recovery](BACKUP_AND_RECOVERY.md) to restore a known snapshot or
use the recoverable reset tools. Never delete the music folders to reset Bebop.

## Development and packaging

Run the full local gates from the README. On Arch/Omarchy, build AppImage, DEB, and RPM artifacts
with `scripts/build-linux-release-docker`; the pinned Debian baseline avoids modern host ELF
sections that the AppImage packaging toolchain cannot strip.
