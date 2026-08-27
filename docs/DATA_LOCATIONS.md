# Data locations

Bebop obtains its application-data directory from Tauri. The usual locations are:

| Platform | Application-data directory                               |
| -------- | -------------------------------------------------------- |
| Linux    | `${XDG_DATA_HOME:-$HOME/.local/share}/com.dbgoodm.bebop` |
| Windows  | `%APPDATA%\com.dbgoodm.bebop`                            |

The directory contains:

| Path                                     | Purpose                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `bebop.sqlite3`                          | Catalog, roots, overrides, settings, collections, history, jobs, and caches |
| `bebop.sqlite3-wal`, `bebop.sqlite3-shm` | SQLite write-ahead-log sidecars while active                                |
| `artwork/`                               | Hash-addressed embedded, sidecar, and approved online artwork               |
| `database-backups/`                      | Consistent SQLite snapshots made before schema upgrades                     |
| `database-recovery/`                     | Corrupt database files preserved before Bebop creates a clean catalog       |

The database and artwork cache are never placed in a music root. The only Bebop-created directory
beside music is `.bebop-backups/`, created after an explicit tag-file write and containing one
retained full-file backup per edited source file.

Last.fm secrets live in the platform credential store under the Bebop service, outside
the frontend and SQLite.
