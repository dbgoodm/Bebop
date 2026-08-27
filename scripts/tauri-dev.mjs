import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const environment = { ...process.env };

// Match the native NVIDIA fallback during development. Keep other platforms untouched and allow
// explicit shell values to override these defaults.
//
// These force WebKit to rasterize on the CPU and to copy frames through shared memory
// instead of sharing GPU buffers directly. That works around older NVIDIA driver bugs
// that produced blank webviews, but it costs a lot of scrolling performance and can
// tear, because software frames are not synchronized with the compositor.
//
// Set BEBOP_GPU=1 to keep hardware rendering and check whether the workaround is still
// needed on the current driver. A blank or black window means it is.
const forceSoftwareRendering =
  process.platform === "linux" &&
  process.env.BEBOP_GPU !== "1" &&
  (existsSync("/proc/driver/nvidia/version") || existsSync("/sys/module/nvidia"));

if (forceSoftwareRendering) {
  environment.WEBKIT_DMABUF_RENDERER_FORCE_SHM ??= "1";
  environment.WEBKIT_SKIA_ENABLE_CPU_RENDERING ??= "1";
} else if (process.env.BEBOP_GPU === "1") {
  // `??=` above would leave inherited values in place, so clear them explicitly.
  delete environment.WEBKIT_DMABUF_RENDERER_FORCE_SHM;
  delete environment.WEBKIT_SKIA_ENABLE_CPU_RENDERING;
  console.log("[bebop] BEBOP_GPU=1 — hardware rendering enabled (software fallback skipped)");
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
