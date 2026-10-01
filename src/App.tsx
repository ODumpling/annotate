import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand/react'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  DownloadIcon,
  EyeIcon,
  ImageUpIcon,
  Loader2Icon,
  MousePointerClickIcon,
  PencilIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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

const TAB_CLASS =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-3 font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm dark:aria-selected:bg-input/50'

const WARNING_ALERT_CLASS =
  'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'

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

  const hasImage = Boolean(imageUrl && page)

  const dropzone = (
    <label
      className={cn(
        'group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground transition-colors has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50',
        hasImage ? 'px-4 py-5' : 'px-6 py-16',
        dragActive
          ? 'border-primary bg-primary/5 text-foreground'
          : 'border-border hover:border-primary/50 hover:bg-muted/50',
        isIngesting
          ? 'pointer-events-none cursor-not-allowed opacity-60'
          : 'cursor-pointer',
      )}
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
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
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
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full bg-muted text-foreground transition-colors group-data-[drag-active=true]:bg-primary group-data-[drag-active=true]:text-primary-foreground',
          hasImage ? 'size-9' : 'size-14',
        )}
      >
        {isIngesting ? (
          <Loader2Icon className="size-5 animate-spin" />
        ) : (
          <ImageUpIcon className={hasImage ? 'size-4' : 'size-6'} />
        )}
      </span>
      {hasImage
        ? 'Drag and drop an image here, or click to replace the current one.'
        : 'Drag and drop a PNG, JPEG, or WebP image, or click to choose one.'}
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
  )

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
            >
              <MousePointerClickIcon className="size-4" />
            </span>
            <h1 className="text-base font-semibold tracking-tight">Annotate</h1>
          </div>
          {hasImage && (
            <div
              role="tablist"
              aria-label="View mode"
              className="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'edit'}
                onClick={() => setMode('edit')}
                className={TAB_CLASS}
              >
                <PencilIcon aria-hidden="true" className="size-3.5" />
                Edit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'preview'}
                onClick={() => setMode('preview')}
                className={TAB_CLASS}
              >
                <EyeIcon aria-hidden="true" className="size-3.5" />
                Preview
              </button>
            </div>
          )}
          {hasImage && mode === 'edit' && (
            <Button
              type="button"
              className="ml-auto"
              disabled={isExporting}
              onClick={() => void handleExport()}
            >
              {isExporting ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <DownloadIcon aria-hidden="true" />
              )}
              {isExporting ? 'Exporting…' : 'Export standalone HTML'}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
        {mode === 'edit' && (
          <>
            {(isIngesting ||
              error ||
              warnings.length > 0 ||
              exportError ||
              isExporting ||
              exportSuccessMessage ||
              exportWarning) && (
              <div className="flex flex-col gap-2">
                {isIngesting && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Loader2Icon
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                    Reading image…
                  </p>
                )}
                {error && (
                  <Alert variant="destructive">
                    <CircleAlertIcon aria-hidden="true" />
                    <AlertDescription className="text-destructive">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}
                {warnings.length > 0 && (
                  <Alert role="status" className={WARNING_ALERT_CLASS}>
                    <TriangleAlertIcon aria-hidden="true" />
                    <ul className="flex flex-col gap-0.5">
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
                {exportError && (
                  <Alert variant="destructive">
                    <CircleAlertIcon aria-hidden="true" />
                    <AlertDescription className="text-destructive">
                      {exportError}
                    </AlertDescription>
                  </Alert>
                )}
                {isExporting && (
                  <p role="status" className="sr-only">
                    Exporting…
                  </p>
                )}
                {exportSuccessMessage && (
                  <Alert
                    role="status"
                    className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                  >
                    <CircleCheckIcon aria-hidden="true" />
                    {exportSuccessMessage}
                  </Alert>
                )}
                {exportWarning && (
                  <Alert role="status" className={WARNING_ALERT_CLASS}>
                    <TriangleAlertIcon aria-hidden="true" />
                    {exportWarning}
                  </Alert>
                )}
              </div>
            )}
            {imageUrl && page ? (
              <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="h-[70vh] min-h-[420px] rounded-xl border bg-card p-3 shadow-xs lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
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
                <div className="flex flex-col gap-4">
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
                  {dropzone}
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 py-10">
                <div className="flex flex-col gap-2 text-center">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Start with an image
                  </h2>
                  <p className="text-balance text-muted-foreground">
                    Mark hotspots on a screenshot, floor plan, or diagram, then
                    export it as a single self-contained HTML file.
                  </p>
                </div>
                {dropzone}
              </div>
            )}
          </>
        )}
        {mode === 'preview' && imageUrl && page && (
          <div className="mx-auto w-full max-w-5xl rounded-xl border bg-card p-4 shadow-xs sm:p-6">
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
    </div>
  )
}

export default App
