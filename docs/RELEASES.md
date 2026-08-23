# Releases and signed updates

Bebop publishes Linux x64 AppImage, DEB, and RPM packages and a Windows x64 NSIS installer from
version tags. The release workflow creates a draft, generates release notes, updater signatures,
`latest.json`, SHA-256 checksums, and retained workflow artifacts. Stable publication is a separate
protected-environment action that validates every checksum, requires the updater signatures, and
requires a valid Authenticode signature on the Windows installer.

## Protected release configuration

Create protected GitHub environments named `release` and `stable-release`. Configure these secrets
on `release`:

- `TAURI_SIGNING_PRIVATE_KEY` and optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `WINDOWS_CERTIFICATE` (base64 PFX) and `WINDOWS_CERTIFICATE_PASSWORD`
- `BEBOP_LASTFM_API_KEY`, `BEBOP_LASTFM_API_SECRET`, and `BEBOP_DISCORD_APPLICATION_ID`

The updater public key is committed in `src-tauri/updater.pubkey` and embedded in
`tauri.conf.json`. The corresponding private key must never enter Git. Losing it prevents future
updates to installed clients. Stable Windows releases fail closed if the certificate is absent;
only version tags containing a SemVer prerelease suffix may produce an unsigned Windows
prerelease.

Push a `vMAJOR.MINOR.PATCH` tag to build a draft. Inspect its physical Linux and Windows smoke-test
results, then run **Promote stable release** with the tag. The promotion job verifies assets before
making it the `latest` release used by Bebop's updater endpoint.

## Client behavior

The Rust updater checks GitHub's stable `latest.json` endpoint no more than once per 24 hours and
also exposes **Check for updates** in Settings. It never downloads automatically. Installation
requires explicit confirmation, validates Tauri's mandatory signature before changing the
application, and stops playback only after download and verification.

## Omarchy and Arch-family install

`packaging/omarchy/install-bebop` downloads the latest AppImage and `CHECKSUMS.txt`, validates the
artifact, and installs it for the current user. It requires `curl`, `jq`, `sha256sum`, and `gio`.

```bash
./packaging/omarchy/install-bebop
```

The AppImage is installed under the XDG data directory with a launcher in `~/.local/bin` and a
desktop entry. AppImage is also the Linux artifact consumed by automatic updates.

On rolling-release Linux distributions, build release artifacts in the supported Debian 12
baseline instead of bundling host libraries. The repository includes a reproducible Docker helper:

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=/secure/path/bebop.key scripts/build-linux-release-docker
```

It copies only final AppImage, signature, DEB, and RPM outputs back to the ignored `dist/linux`
directory. This avoids the older `linuxdeploy` tool attempting to strip newer `RELR` ELF sections
from Arch/Omarchy host libraries.
