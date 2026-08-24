import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const environment = { ...process.env };

// Match the native NVIDIA fallback during development. Keep other platforms untouched and allow
// explicit shell values to override these defaults.
if (
  process.platform === "linux" &&
  (existsSync("/proc/driver/nvidia/version") || existsSync("/sys/module/nvidia"))
) {
  environment.WEBKIT_DMABUF_RENDERER_FORCE_SHM ??= "1";
  environment.WEBKIT_SKIA_ENABLE_CPU_RENDERING ??= "1";
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
