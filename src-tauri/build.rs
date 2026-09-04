fn main() {
    if embed_test_manifest() {
        // Suppress tauri_build's own default manifest embed for this
        // invocation -- it already reaches the "bebop-desktop" bin's own
        // test harness, and adding ours on top of it collides ("duplicate
        // resource... type:MANIFEST"). Our own manifest below is applied to
        // every `tests`-kind target instead, which covers both that bin
        // test harness and the separate `--lib` test harness that
        // tauri_build's manifest never reaches.
        tauri_build::try_build(
            tauri_build::Attributes::new()
                .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
        )
        .expect("tauri_build::try_build failed");
    } else {
        tauri_build::build();
    }
}

/// `cargo test` on Windows only links tauri_build's default icon/manifest
/// resources into the app's `[[bin]]` target (and, transitively, that bin's
/// own unit-test harness) -- the *library* crate's own test binary never
/// gets one. Without a manifest declaring Common Controls v6, that binary's
/// comctl32 import resolves to the old v5 DLL, which is missing an export
/// something in the dependency chain needs -- it fails to even load,
/// crashing with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) before any test
/// runs. This is a known, unresolved-upstream Tauri limitation:
/// https://github.com/tauri-apps/tauri/issues/11028
///
/// Returns true (and emits the linker args to embed our own manifest into
/// every `tests`-kind target) only when `BEBOP_EMBED_TEST_MANIFEST` is set,
/// which the CI `cargo test` step sets explicitly -- so this never touches
/// the real app binary's own manifest.
fn embed_test_manifest() -> bool {
    println!("cargo:rerun-if-env-changed=BEBOP_EMBED_TEST_MANIFEST");
    if std::env::var_os("BEBOP_EMBED_TEST_MANIFEST").is_none() {
        return false;
    }
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !is_windows_msvc {
        return false;
    }

    let manifest = std::env::current_dir()
        .expect("build script has no current dir")
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
    println!(
        "cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}",
        manifest.display()
    );
    true
}
