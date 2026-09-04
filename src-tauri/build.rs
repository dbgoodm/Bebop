fn main() {
    tauri_build::build();

    embed_test_manifest();
}

/// `cargo test` only links the `--lib` test harness binary, which skips
/// tauri_build's normal Windows resource/manifest embedding (that only runs
/// for the app's `[[bin]]` target during a real build). Without a manifest
/// declaring Common Controls v6, the test binary's comctl32 import resolves
/// to the old v5 DLL, which is missing an export something in the
/// dependency chain needs -- the binary fails to even load, crashing with
/// `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) before any test runs. This is
/// a known, unresolved-upstream Tauri limitation on Windows:
/// https://github.com/tauri-apps/tauri/issues/11028
///
/// Scoped behind `BEBOP_EMBED_TEST_MANIFEST` (set only for the `cargo test`
/// CI step) so this never touches the real app binary's own manifest.
fn embed_test_manifest() {
    println!("cargo:rerun-if-env-changed=BEBOP_EMBED_TEST_MANIFEST");
    if std::env::var_os("BEBOP_EMBED_TEST_MANIFEST").is_none() {
        return;
    }
    let is_windows_msvc = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    if !is_windows_msvc {
        return;
    }

    let manifest = std::env::current_dir()
        .expect("build script has no current dir")
        .join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
}
