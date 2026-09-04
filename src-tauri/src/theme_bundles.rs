use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use image::{GenericImageView, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

use crate::AppError;

const ASSET_LIMIT: u64 = 8 * 1024 * 1024;
const BUNDLE_EXPANDED_LIMIT: u64 = 20 * 1024 * 1024;
const PIXEL_LIMIT: u64 = 40_000_000;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ThemeAssetReference {
    pub path: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    pub staged_path: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportedThemeBundle {
    pub manifest_json: String,
    pub theme_id: String,
    pub staging_key: String,
    pub assets: Vec<ThemeAssetReference>,
}

fn theme_error(code: &'static str, message: impl Into<String>) -> AppError {
    AppError::new(code, message)
}

fn safe_id(value: &str) -> Result<&str, AppError> {
    if (2..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && value.as_bytes()[0].is_ascii_alphanumeric()
    {
        Ok(value)
    } else {
        Err(theme_error(
            "invalid-theme-id",
            "Theme IDs may contain only lowercase letters, numbers, and hyphens.",
        ))
    }
}

fn staging_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("theme-staging"))
        .map_err(|error| theme_error("theme-storage-unavailable", error.to_string()))
}

fn themes_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("themes"))
        .map_err(|error| theme_error("theme-storage-unavailable", error.to_string()))
}

fn validate_image(path: &Path) -> Result<ThemeAssetReference, AppError> {
    let metadata = fs::metadata(path)
        .map_err(|error| theme_error("theme-image-unreadable", error.to_string()))?;
    if !metadata.is_file() || metadata.len() > ASSET_LIMIT {
        return Err(theme_error(
            "theme-image-too-large",
            "Theme images must be regular files no larger than 8 MiB.",
        ));
    }
    let reader = ImageReader::open(path)
        .map_err(|error| theme_error("theme-image-unreadable", error.to_string()))?
        .with_guessed_format()
        .map_err(|error| theme_error("theme-image-malformed", error.to_string()))?;
    let format = reader.format().ok_or_else(|| {
        theme_error(
            "theme-image-type",
            "The image format could not be determined.",
        )
    })?;
    let (mime_type, extension) = match format {
        ImageFormat::Png => ("image/png", "png"),
        ImageFormat::Jpeg => ("image/jpeg", "jpg"),
        ImageFormat::WebP => ("image/webp", "webp"),
        _ => {
            return Err(theme_error(
                "theme-image-type",
                "Only PNG, JPEG, and WebP images are supported.",
            ));
        }
    };
    let image = reader
        .decode()
        .map_err(|error| theme_error("theme-image-malformed", error.to_string()))?;
    let (width, height) = image.dimensions();
    if u64::from(width) * u64::from(height) > PIXEL_LIMIT {
        return Err(theme_error(
            "theme-image-dimensions",
            "Theme images may not exceed 40 megapixels.",
        ));
    }
    Ok(ThemeAssetReference {
        path: format!("{}.{}", Uuid::new_v4(), extension),
        mime_type: mime_type.to_string(),
        width,
        height,
        bytes: metadata.len(),
        staged_path: None,
    })
}

pub fn stage_theme_asset(
    app: AppHandle,
    staging_key: String,
    source_path: String,
) -> Result<ThemeAssetReference, AppError> {
    safe_id(&staging_key)?;
    let source = fs::canonicalize(source_path)
        .map_err(|error| theme_error("theme-image-unreadable", error.to_string()))?;
    let mut reference = validate_image(&source)?;
    let destination_dir = staging_root(&app)?.join(&staging_key).join("assets");
    fs::create_dir_all(&destination_dir)
        .map_err(|error| theme_error("theme-storage-unavailable", error.to_string()))?;
    let destination = destination_dir.join(&reference.path);
    fs::copy(&source, &destination)
        .map_err(|error| theme_error("theme-image-stage-failed", error.to_string()))?;
    reference.staged_path = Some(destination.to_string_lossy().into_owned());
    Ok(reference)
}

pub fn cancel_theme_asset_staging(app: AppHandle, staging_key: String) -> Result<(), AppError> {
    safe_id(&staging_key)?;
    let target = staging_root(&app)?.join(staging_key);
    if target.exists() {
        fs::remove_dir_all(target)
            .map_err(|error| theme_error("theme-staging-cleanup-failed", error.to_string()))?;
    }
    Ok(())
}

pub fn promote_theme_assets(
    app: AppHandle,
    staging_key: String,
    theme_id: String,
    overwrite: bool,
) -> Result<(), AppError> {
    safe_id(&staging_key)?;
    safe_id(&theme_id)?;
    let source = staging_root(&app)?.join(&staging_key).join("assets");
    let destination = themes_root(&app)?.join(theme_id);
    if destination.exists() && !overwrite {
        return Err(theme_error(
            "theme-id-collision",
            "A theme with this ID already exists.",
        ));
    }
    fs::create_dir_all(&destination)
        .map_err(|error| theme_error("theme-assets-save-failed", error.to_string()))?;
    if source.exists() {
        for entry in fs::read_dir(&source)
            .map_err(|error| theme_error("theme-assets-save-failed", error.to_string()))?
        {
            let entry = entry
                .map_err(|error| theme_error("theme-assets-save-failed", error.to_string()))?;
            fs::copy(entry.path(), destination.join(entry.file_name()))
                .map_err(|error| theme_error("theme-assets-save-failed", error.to_string()))?;
        }
    }
    let _ = fs::remove_dir_all(staging_root(&app)?.join(safe_id(&staging_key)?));
    Ok(())
}

pub fn delete_theme_assets(app: AppHandle, theme_id: String) -> Result<(), AppError> {
    safe_id(&theme_id)?;
    let target = themes_root(&app)?.join(theme_id);
    if target.exists() {
        fs::remove_dir_all(target)
            .map_err(|error| theme_error("theme-assets-delete-failed", error.to_string()))?;
    }
    Ok(())
}

pub fn export_theme_bundle(
    app: AppHandle,
    theme_id: String,
    manifest_json: String,
    destination_path: String,
) -> Result<(), AppError> {
    safe_id(&theme_id)?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|error| theme_error("theme-manifest-invalid", error.to_string()))?;
    if manifest.get("id").and_then(|value| value.as_str()) != Some(&theme_id) {
        return Err(theme_error(
            "theme-manifest-invalid",
            "The manifest ID does not match the selected theme.",
        ));
    }
    let destination = PathBuf::from(destination_path);
    let file = File::create(destination)
        .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    zip.start_file("manifest.json", options)
        .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
    let assets = themes_root(&app)?.join(&theme_id);
    if assets.exists() {
        for entry in fs::read_dir(assets)
            .map_err(|error| theme_error("theme-export-failed", error.to_string()))?
        {
            let entry =
                entry.map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
            if !entry
                .file_type()
                .map_err(|error| theme_error("theme-export-failed", error.to_string()))?
                .is_file()
            {
                continue;
            }
            let mut bytes = Vec::new();
            File::open(entry.path())
                .and_then(|mut file| file.read_to_end(&mut bytes))
                .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            zip.start_file(format!("assets/{name}"), options)
                .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
            zip.write_all(&bytes)
                .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
        }
    }
    zip.finish()
        .map_err(|error| theme_error("theme-export-failed", error.to_string()))?;
    Ok(())
}

pub fn import_theme_bundle(
    app: AppHandle,
    bundle_path: String,
) -> Result<ImportedThemeBundle, AppError> {
    let file = File::open(bundle_path)
        .map_err(|error| theme_error("theme-import-failed", error.to_string()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| theme_error("theme-bundle-corrupt", error.to_string()))?;
    let mut expanded = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| theme_error("theme-bundle-corrupt", error.to_string()))?;
        expanded = expanded.saturating_add(entry.size());
        if expanded > BUNDLE_EXPANDED_LIMIT {
            return Err(theme_error(
                "theme-bundle-too-large",
                "Theme bundles may expand to at most 20 MiB.",
            ));
        }
        let path = Path::new(entry.name());
        if path.is_absolute()
            || path.components().any(|part| {
                matches!(
                    part,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(theme_error(
                "theme-bundle-traversal",
                "The bundle contains an unsafe path.",
            ));
        }
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(theme_error(
                "theme-bundle-traversal",
                "Symbolic links are not allowed in theme bundles.",
            ));
        }
        if entry.name() != "manifest.json" && !entry.name().starts_with("assets/") {
            return Err(theme_error(
                "theme-bundle-layout",
                "Bundles may contain only manifest.json and assets/.",
            ));
        }
    }
    let mut manifest_json = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| {
            theme_error(
                "theme-manifest-missing",
                "The bundle does not contain manifest.json.",
            )
        })?
        .read_to_string(&mut manifest_json)
        .map_err(|error| theme_error("theme-manifest-invalid", error.to_string()))?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_json)
        .map_err(|error| theme_error("theme-manifest-invalid", error.to_string()))?;
    let theme_id = safe_id(
        manifest
            .get("id")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                theme_error(
                    "theme-manifest-invalid",
                    "The manifest is missing a theme ID.",
                )
            })?,
    )?
    .to_string();
    if themes_root(&app)?.join(&theme_id).exists() {
        return Err(theme_error(
            "theme-id-collision",
            "A theme with this ID already exists.",
        ));
    }
    let staging_key = format!("import-{}", Uuid::new_v4().simple());
    let assets_dir = staging_root(&app)?.join(&staging_key).join("assets");
    fs::create_dir_all(&assets_dir)
        .map_err(|error| theme_error("theme-import-failed", error.to_string()))?;
    let mut assets = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| theme_error("theme-bundle-corrupt", error.to_string()))?;
        if entry.is_dir() || !entry.name().starts_with("assets/") {
            continue;
        }
        let filename = Path::new(entry.name())
            .file_name()
            .ok_or_else(|| theme_error("theme-bundle-layout", "Invalid asset filename."))?;
        let filename = filename.to_owned();
        let destination = assets_dir.join(&filename);
        let mut output = File::create(&destination)
            .map_err(|error| theme_error("theme-import-failed", error.to_string()))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| theme_error("theme-import-failed", error.to_string()))?;
        let mut reference = validate_image(&destination)?;
        reference.path = filename.to_string_lossy().into_owned();
        reference.staged_path = Some(destination.to_string_lossy().into_owned());
        assets.push(reference);
    }
    Ok(ImportedThemeBundle {
        manifest_json,
        theme_id,
        staging_key,
        assets,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_ids() {
        assert!(safe_id("../../themes").is_err());
        assert!(safe_id("space-cowboy-v2").is_ok());
    }

    #[test]
    fn recognizes_parent_components() {
        let path = Path::new("assets/../manifest.json");
        assert!(
            path.components()
                .any(|part| matches!(part, Component::ParentDir))
        );
    }
}
