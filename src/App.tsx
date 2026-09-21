import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand/react'
import {
  EXPORT_WARN_BYTES,
  ExportError,
  exportFileName,
  exportProject,
} from './export'
import {
  formatMiB,
  getBlob,
  ingestImage,
  ingestImageIntoProject,
  IngestError,
} from './ingest'
import { HotspotInspector } from './inspector'
import { InteractivePreview } from './preview'
import { ProjectSettingsPanel } from './settings'
import { projectStore } from './store'
import { ImageViewport } from './viewer'

type AppMode = 'edit' | 'preview'

function App() {
  const project = useStore(projectStore, (state) => state.project)
  const selectedHotspotId = useStore(
    projectStore,
    (state) => state.selectedHotspotId,
  )
  const actions = useStore(projectStore, (state) => state.actions)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isIngesting, setIsIngesting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccessMessage, setExportSuccessMessage] = useState<
    string | null
  >(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportWarning, setExportWarning] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [mode, setMode] = useState<AppMode>('edit')

  const page = project.pages[0]
  const pageHotspots = page
    ? project.hotspots.filter((hotspot) => hotspot.pageId === page.id)
    : []
  const blob = useMemo(
    () =>
      project.source?.kind === 'image'
        ? getBlob(project.source.blobKey)
        : undefined,
    [project.source],
  )
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    // Object URLs are an external resource that must be created and revoked
    // as a side effect; the resulting URL can't be derived during render.
    if (!blob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImageUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  useEffect(() => {
    // A file dropped outside the dropzone must never fall back to the
    // browser default of navigating to the file, which would silently
    // destroy all in-memory work. Cancelling dragover makes the window a
    // valid drop target so the drop event can be cancelled here; drops
    // that land on the dropzone label are unaffected because its own
    // handlers run first and already cancel the default.
    function cancelDragDefault(event: DragEvent) {
      event.preventDefault()
    }
    window.addEventListener('dragover', cancelDragDefault)
    window.addEventListener('drop', cancelDragDefault)
    return () => {
      window.removeEventListener('dragover', cancelDragDefault)
      window.removeEventListener('drop', cancelDragDefault)
    }
  }, [])

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || isIngesting) return
    const multiFileWarning =
      files.length > 1
        ? [`Only the first file was used; ${files.length} files were dropped.`]
        : []
    setError(null)
    setWarnings(multiFileWarning)
    setIsIngesting(true)
    try {
      const ingested = await ingestImage(file)
      ingestImageIntoProject(actions, project.source !== null, ingested)
      setWarnings([...multiFileWarning, ...ingested.warnings])
    } catch (cause) {
      setError(
        cause instanceof IngestError
          ? cause.message
          : 'Could not read that file.',
      )
    } finally {
      setIsIngesting(false)
    }
  }

  async function handleExport() {
    if (isExporting) return
    setExportError(null)
    setExportSuccessMessage(null)
    setExportWarning(null)
    setIsExporting(true)
    try {
      const result = await exportProject(project, getBlob)
      const blob = new Blob([result.html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const fileName = exportFileName(project)
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      setExportSuccessMessage(`Exported ${fileName}.`)
      if (result.sizeWarning) {
        setExportWarning(
          `Exported file is ${formatMiB(result.byteLength)}, larger than the recommended ${formatMiB(EXPORT_WARN_BYTES)}.`,
        )
      }
    } catch (cause) {
      setExportError(
        cause instanceof ExportError
          ? cause.message
          : 'Could not export this project.',
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-slate-950 px-6 py-10 text-slate-100">
      <h1 className="text-4xl font-semibold tracking-tight">Annotate</h1>
      {imageUrl && page && (
        <div
          role="tablist"
          aria-label="View mode"
          className="flex gap-2 text-sm"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'edit'}
            onClick={() => setMode('edit')}
            className="rounded-lg border border-slate-500 px-4 py-1.5 font-medium aria-selected:bg-slate-800"
          >
            Edit
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'preview'}
            onClick={() => setMode('preview')}
            className="rounded-lg border border-slate-500 px-4 py-1.5 font-medium aria-selected:bg-slate-800"
          >
            Preview
          </button>
        </div>
      )}
      {mode === 'edit' && (
        <>
          <label
            className={`flex w-full max-w-md flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center text-sm ${
              dragActive
                ? 'border-sky-400 bg-sky-950/40 text-sky-300'
                : 'border-slate-500 text-slate-400'
            } ${
              isIngesting
                ? 'pointer-events-none cursor-not-allowed opacity-60'
                : 'cursor-pointer'
            }`}
            data-drag-active={dragActive ? 'true' : 'false'}
            aria-busy={isIngesting}
            onDragEnter={(event) => {
              if (isIngesting) return
              event.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(event) => {
              if (isIngesting) return
              event.preventDefault()
            }}
            onDragLeave={(event) => {
              // dragleave also fires when the pointer moves between the
              // label's own children; only deactivate on a real exit.
              const next = event.relatedTarget
              if (
                !(next instanceof Node) ||
                !event.currentTarget.contains(next)
              ) {
                setDragActive(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (isIngesting) return
              setDragActive(false)
              void handleFiles(event.dataTransfer.files)
            }}
          >
            Drag and drop a PNG, JPEG, or WebP image, or click to choose one.
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={isIngesting}
              onChange={(event) => {
                const input = event.currentTarget
                void handleFiles(input.files).finally(() => {
                  // Reset so re-selecting the same file path fires change again.
                  input.value = ''
                })
              }}
            />
          </label>
          {isIngesting && (
            <p role="status" className="text-sm text-slate-400">
              Reading image…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {warnings.length > 0 && (
            <ul role="status" className="text-sm text-amber-400">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {exportError && (
            <p role="alert" className="text-sm text-red-400">
              {exportError}
            </p>
          )}
          {imageUrl && page && (
            <div className="flex w-full max-w-6xl flex-col gap-4 lg:flex-row">
              <div className="h-[60vh] flex-1">
                <ImageViewport
                  imageUrl={imageUrl}
                  naturalWidth={page.width}
                  naturalHeight={page.height}
                  editing={{
                    pageId: page.id,
                    hotspots: pageHotspots,
                    selectedHotspotId,
                    actions,
                  }}
                />
              </div>
              <div className="flex flex-col gap-3 lg:w-96">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleExport()}
                  className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {isExporting ? 'Exporting…' : 'Export standalone HTML'}
                </button>
                {isExporting && (
                  <p role="status" className="sr-only">
                    Exporting…
                  </p>
                )}
                {exportSuccessMessage && (
                  <p role="status" className="text-sm text-emerald-400">
                    {exportSuccessMessage}
                  </p>
                )}
                {exportWarning && (
                  <p role="status" className="text-sm text-amber-400">
                    {exportWarning}
                  </p>
                )}
                <ProjectSettingsPanel
                  settings={project.settings}
                  actions={actions}
                />
                <HotspotInspector
                  pageId={page.id}
                  hotspots={pageHotspots}
                  selectedHotspotId={selectedHotspotId}
                  actions={actions}
                />
              </div>
            </div>
          )}
        </>
      )}
      {mode === 'preview' && imageUrl && page && (
        <div className="w-full max-w-4xl">
          <InteractivePreview
            imageUrl={imageUrl}
            imageAlt={project.name}
            pageId={page.id}
            pageWidth={page.width}
            pageHeight={page.height}
            hotspots={pageHotspots}
            showBadgeNumbers={project.settings.showBadgeNumbers}
          />
        </div>
      )}
    </main>
  )
}

export default App
