import { spawn } from "node:child_process";

const environment = { ...process.env };

// WebKitGTK's DMABUF renderer can trigger a GDK Wayland protocol error on Omarchy.
// Keep Windows untouched and allow an explicit shell environment to override this default.
if (
  process.platform === "linux" &&
  environment.WEBKIT_DISABLE_DMABUF_RENDERER === undefined
) {
  environment.WEBKIT_DISABLE_DMABUF_RENDERER = "1";
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tauri = spawn(
  npmCommand,
  ["exec", "tauri", "--", "dev", "--config", "src-tauri/tauri.conf.json"],
  { env: environment, stdio: "inherit" },
);

tauri.on("error", (error) => {
  console.error(`Unable to start Tauri: ${error.message}`);
  process.exitCode = 1;
});

tauri.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
