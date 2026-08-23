<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Bebop frontend

The frontend is a Vite/React workspace package for Bebop's local-first desktop player.

Run `npm install` at the repository root, then use `npm run dev` or `npm run build`.

For browser-only UI development, set `VITE_BEBOP_DEMO=true`. Demo data and Web Audio are
never enabled by default and will be replaced by typed Tauri IPC in later milestones.
