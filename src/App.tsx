import { useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand/react'
import {
  getBlob,
  ingestImage,
  ingestImageIntoProject,
  IngestError,
} from './ingest'
import { projectStore } from './store'
import { ImageViewport } from './viewer'

function App() {
  const project = useStore(projectStore, (state) => state.project)
  const actions = useStore(projectStore, (state) => state.actions)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isIngesting, setIsIngesting] = useState(false)

  const page = project.pages[0]
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

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || isIngesting) return
    setError(null)
    setWarnings([])
    setIsIngesting(true)
    try {
      const ingested = await ingestImage(file)
      ingestImageIntoProject(actions, project.source !== null, ingested)
      setWarnings(ingested.warnings)
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

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-slate-950 px-6 py-10 text-slate-100">
      <h1 className="text-4xl font-semibold tracking-tight">Annotate</h1>
      <label
        className="flex w-full max-w-md cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-700 px-6 py-8 text-center text-sm text-slate-400"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void handleFiles(event.dataTransfer.files)
        }}
      >
        Drag and drop a PNG, JPEG, or WebP image, or click to choose one.
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={isIngesting}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </label>
      {isIngesting && <p className="text-sm text-slate-400">Reading image…</p>}
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
      {imageUrl && page && (
        <div className="h-[60vh] w-full max-w-3xl">
          <ImageViewport
            imageUrl={imageUrl}
            naturalWidth={page.width}
            naturalHeight={page.height}
          />
        </div>
      )}
    </main>
  )
}

export default App
