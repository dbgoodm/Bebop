# Acquisition Policy (V3)

Acquisition engines and third-party download connectors have been intentionally removed in Bebop V3.

Bebop focuses strictly on pure local-first playback with remote catalog enrichment (via MusicBrainz discography and metadata).

## Future Clean-Room Design Guidelines

Any future acquisition workflow must be built clean-room from the ground up:
1. Resolve metadata, ISRC, and release group details through authoritative public registries.
2. Perform deterministic provider-matching with explicit user confirmation.
3. Choose verified quality fallbacks.
4. Perform isolated file transfer, hash/audio validation, tag writing, and safe atomic library import.
5. Never incorporate proprietary, private, or reverse-engineered downloading code.
