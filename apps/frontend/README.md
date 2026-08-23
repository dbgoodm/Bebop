# Bebop frontend

The frontend is a Vite/React workspace package for Bebop's local-first desktop player.

Run `npm ci` at the repository root, then use `npm run dev` or `npm run build`.

For browser-only UI development, set `VITE_BEBOP_DEMO=true`. Demo data and Web Audio are
never enabled by default. The production desktop flow uses generated Tauri IPC and Rust-owned
playback; see the root README for the complete setup and validation instructions.
