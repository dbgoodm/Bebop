use chrono::Utc;
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::{AppError, AppState, persistence::DatabaseWorker, shutdown_playback};

const LAST_CHECK_KEY: &str = "release.last-update-check-at";
const CHECK_INTERVAL_SECONDS: i64 = 24 * 60 * 60;
pub(crate) const STATUS_EVENT: &str = "update://status";
pub(crate) const PROGRESS_EVENT: &str = "update://progress";

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub checked: bool,
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub error: Option<AppError>,
}

#[derive(Clone, Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub finished: bool,
}

pub(crate) async fn check(app: AppHandle, database: DatabaseWorker, manual: bool) -> UpdateStatus {
    let current_version = app.package_info().version.to_string();
    let now = Utc::now().timestamp();
    if !manual && !check_due(&database, now) {
        return UpdateStatus {
            checked: false,
            available: false,
            current_version,
            version: None,
            notes: None,
            published_at: None,
            error: None,
        };
    }
    if let Err(error) = database.set_ui_preference(LAST_CHECK_KEY.into(), now.to_string()) {
        return failed(current_version, error);
    }
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => return failed(current_version, updater_error("create-updater", error)),
    };
    match updater.check().await {
        Ok(Some(update)) => UpdateStatus {
            checked: true,
            available: true,
            current_version: update.current_version,
            version: Some(update.version),
            notes: update.body,
            published_at: update.date.map(|value| value.to_string()),
            error: None,
        },
        Ok(None) => UpdateStatus {
            checked: true,
            available: false,
            current_version,
            version: None,
            notes: None,
            published_at: None,
            error: None,
        },
        Err(error) => failed(current_version, updater_error("check", error)),
    }
}

pub(crate) async fn install(app: AppHandle, confirmed: bool) -> Result<(), AppError> {
    if !confirmed {
        return Err(AppError::new(
            "update-install-not-confirmed",
            "Installing an update requires explicit confirmation.",
        ));
    }
    let update = app
        .updater()
        .map_err(|error| updater_error("create-updater", error))?
        .check()
        .await
        .map_err(|error| updater_error("check", error))?
        .ok_or_else(|| AppError::new("update-not-available", "Bebop is already up to date."))?;
    let progress_app = app.clone();
    let finished_app = app.clone();
    let mut downloaded_bytes = 0_u64;
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded_bytes = downloaded_bytes.saturating_add(chunk as u64);
                let _ = progress_app.emit(
                    PROGRESS_EVENT,
                    UpdateProgress {
                        downloaded_bytes,
                        total_bytes: total,
                        finished: false,
                    },
                );
            },
            move || {
                let _ = finished_app.emit(
                    PROGRESS_EVENT,
                    UpdateProgress {
                        downloaded_bytes: 0,
                        total_bytes: None,
                        finished: true,
                    },
                );
            },
        )
        .await
        .map_err(|error| updater_error("download-and-verify", error))?;
    shutdown_playback(&app.state::<AppState>());
    update
        .install(bytes)
        .map_err(|error| updater_error("install", error))?;

    #[cfg(not(target_os = "windows"))]
    app.restart();

    #[allow(unreachable_code)]
    Ok(())
}

pub(crate) fn emit_status(app: &AppHandle, status: &UpdateStatus) {
    let _ = app.emit(STATUS_EVENT, status);
}

fn check_due(database: &DatabaseWorker, now: i64) -> bool {
    database
        .get_ui_preference(LAST_CHECK_KEY.into())
        .ok()
        .flatten()
        .and_then(|value| value.parse::<i64>().ok())
        .is_none_or(|last| now.saturating_sub(last) >= CHECK_INTERVAL_SECONDS)
}

fn failed(current_version: String, error: AppError) -> UpdateStatus {
    UpdateStatus {
        checked: true,
        available: false,
        current_version,
        version: None,
        notes: None,
        published_at: None,
        error: Some(error),
    }
}

fn updater_error(action: &'static str, error: impl std::fmt::Display) -> AppError {
    AppError::new(
        "update-failed",
        "Bebop could not securely complete the update request.",
    )
    .with_context("action", action)
    .with_context("reason", error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_checks_are_limited_to_once_per_day() {
        let database = DatabaseWorker::in_memory().expect("database starts");
        assert!(check_due(&database, 100_000));
        database
            .set_ui_preference(LAST_CHECK_KEY.into(), "100000".into())
            .expect("save last check");
        assert!(!check_due(&database, 100_000 + CHECK_INTERVAL_SECONDS - 1));
        assert!(check_due(&database, 100_000 + CHECK_INTERVAL_SECONDS));
    }
}
