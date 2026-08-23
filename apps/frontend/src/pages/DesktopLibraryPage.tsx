import { FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react';
import { LibraryView } from '@/components/organisms/LibraryView';
import { AppShell } from '@/components/templates/AppShell';
import { useLibraryScan } from '@/hooks/useLibraryScan';
import { useTheme } from '@/services/themeService';

export function DesktopLibraryPage() {
  const { currentTheme } = useTheme();
  const { library, selectAndScan } = useLibraryScan();
  const isScanning = library.phase === 'scanning';
  const progressLabel = library.progress
    ? `${library.progress.scannedFiles} files checked · ${library.progress.discoveredTracks} tracks found`
    : 'Preparing scan…';

  return (
    <AppShell background={currentTheme.bgCanvasGradient || currentTheme.bgCanvas}>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-400">
              Local library
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">Your music, on this device.</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Select a folder to index FLAC, WAV, MP3, and OGG files. Bebop never uploads it.
            </p>
          </div>
          <button
            id="select-library-folder"
            type="button"
            onClick={() => void selectAndScan()}
            disabled={isScanning}
            className="flex items-center gap-2 rounded border border-amber-500/60 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
          >
            {isScanning ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FolderOpen className="h-4 w-4" />
            )}
            {library.root ? 'Choose another folder' : 'Select music folder'}
          </button>
        </header>

        {isScanning && (
          <div
            role="status"
            className="rounded border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
          >
            {progressLabel}
          </div>
        )}

        {library.phase === 'idle' && (
          <div className="rounded border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
            No folder has been selected yet.
          </div>
        )}

        {library.phase === 'empty' && (
          <div className="rounded border border-neutral-800 bg-neutral-950/50 p-6 text-neutral-400">
            No supported audio files were found in{' '}
            <span className="text-neutral-200">{library.root}</span>.
          </div>
        )}

        {(library.phase === 'permission-error' || library.phase === 'error') && library.error && (
          <div
            role="alert"
            className="flex gap-3 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100"
          >
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">{library.error.message}</p>
              <p className="mt-1 text-red-200/80">Choose a folder Bebop is permitted to read.</p>
            </div>
          </div>
        )}

        {library.phase === 'partial-error' && (
          <div
            role="alert"
            className="rounded border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-100"
          >
            Indexed {library.tracks.length} track{library.tracks.length === 1 ? '' : 's'}, but
            skipped {library.warnings.length} unreadable or unsafe path
            {library.warnings.length === 1 ? '' : 's'}.
          </div>
        )}

        {(library.phase === 'complete' || library.phase === 'partial-error') && (
          <LibraryView tracks={library.tracks} onPlayTrack={() => undefined} />
        )}
      </section>
    </AppShell>
  );
}
