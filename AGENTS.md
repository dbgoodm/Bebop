## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Desktop & Webview Runtime Invariants

### 1. Linux Display & Window Rendering
- On Linux (especially Wayland compositors like Hyprland with NVIDIA GPUs), always launch development instances using:
  ```bash
  GDK_BACKEND=x11 npm run tauri:dev
  ```
- Keep `"transparent": false` in `src-tauri/tauri.conf.json` to avoid transparent/invisible window visuals under WebKitGTK.

### 2. Desktop UI & Context Menus
- In webview desktop components, never allow default browser webpage context menus (*"Inspect Element"*, *"Reload"*) to display on standard UI surfaces.
- Route item right-clicks through `useBebopContextMenu` and `<ContextMenu />`, and maintain global suppression on non-editable elements in `main.tsx`.
