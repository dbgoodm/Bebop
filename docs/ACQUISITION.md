# slskd acquisition

Bebop can connect to a separately installed, user-managed slskd instance. The connector is
optional and never searches or downloads automatically. slskd owns Soulseek authentication,
networking, queues, retries, and temporary downloads; Bebop receives search and transfer status
through slskd's HTTP API.

## Connection and credentials

The default endpoint is `http://127.0.0.1:5030`. Loopback HTTP is allowed. Any non-loopback
endpoint must use HTTPS and the user must explicitly confirm it in Settings before Bebop will
connect. The slskd API key is stored in the operating-system credential store under the Bebop
service. It is never returned through IPC, stored in SQLite, or written to application logs.

Set the slskd completed-download directory as Bebop's acquisition inbox. This must be the completed
directory, not slskd's incomplete directory. Pause cancels the current slskd transfer without
removing its partial data; Resume submits the same source file again under a new batch, allowing
slskd's configured retry/resume behavior to continue it.

## Import boundary

Downloads remain outside the music library until the user chooses **Verify and import** and an
enabled, online root. Bebop then:

1. canonicalizes the inbox and finds one exact filename-and-size match beneath it;
2. rejects traversal, symlinks escaping the inbox, ambiguity, unsupported extensions, and files
   that the real Rust decoder cannot open;
3. copies through a newly created adjacent temporary file in the selected library root, flushes it,
   and atomically renames it;
4. decodes the imported copy again, optionally removes the inbox source for Move mode, and rescans
   the affected root.

Existing destination filenames are never overwritten. Acquisition jobs and their errors are
persisted in SQLite and progress is emitted as `acquisition://progress`.

See the [slskd configuration and API documentation](https://github.com/slskd/slskd/blob/master/docs/config.md)
for server-side authentication, download directories, and retry behavior.
