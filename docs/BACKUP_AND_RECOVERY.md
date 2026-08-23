# Backup and recovery

Quit Bebop before copying, restoring, or resetting application data. Music files and the local
catalog have separate backup policies.

## Catalog backups

Before a schema upgrade, Bebop uses SQLite's online backup API to create a consistent snapshot in
`database-backups/`. To make a manual full backup, quit Bebop and copy the entire application-data
directory listed in [data locations](DATA_LOCATIONS.md).

To restore a snapshot:

1. Quit Bebop and make a separate copy of the current application-data directory.
2. Move `bebop.sqlite3`, `bebop.sqlite3-wal`, and `bebop.sqlite3-shm` out of the directory.
3. Copy the chosen snapshot to `bebop.sqlite3`.
4. Start Bebop and run a rescan for every enabled root.

On startup, Bebop runs SQLite `quick_check`. If the database is corrupt, it moves the database and
any WAL/SHM sidecars into a timestamped `database-recovery/` directory before creating a clean
catalog. It never deletes the preserved files or any music.

## Metadata file backups

An explicit **Write tags to files** operation retains the original file under the neighboring
`.bebop-backups/` directory. Bebop writes and validates an adjacent temporary file, compares the
decoded-audio digest, and only then atomically replaces the original. **Restore backup** performs
the same validated temporary replacement. Backups are retained until the user removes them.

## Recoverable reset

The reset tools refuse arbitrary directory names, require the exact confirmation word `RESET`, and
move application data to a sibling backup instead of deleting it. Quit Bebop first.

Linux:

```bash
scripts/reset-local-data --confirm RESET
```

Windows PowerShell:

```powershell
./scripts/reset-local-data.ps1 -Confirmation RESET
```

The command prints the recovery location. Starting Bebop afterward creates a fresh catalog; add or
rescan roots to rebuild file-derived metadata. Database-only overrides, playlists, favorites, and
history require restoration from the moved backup.
