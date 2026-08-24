#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    configure_linux_webkit_renderer();
    bebop_desktop::run();
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_renderer() {
    use std::{env, path::Path};

    if !Path::new("/proc/driver/nvidia/version").exists()
        && !Path::new("/sys/module/nvidia").exists()
    {
        return;
    }

    // This runs before Tauri or WebKit starts any threads. Current WebKitGTK builds can crash in
    // NVIDIA EGL/Skia when using the DMA-BUF/GPU path, so retain shared-memory transport and CPU
    // painting on affected systems while still allowing an explicit environment override.
    unsafe {
        if env::var_os("WEBKIT_DMABUF_RENDERER_FORCE_SHM").is_none() {
            env::set_var("WEBKIT_DMABUF_RENDERER_FORCE_SHM", "1");
        }
        if env::var_os("WEBKIT_SKIA_ENABLE_CPU_RENDERING").is_none() {
            env::set_var("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1");
        }
    }
}

#[cfg(not(target_os = "linux"))]
fn configure_linux_webkit_renderer() {}
