export type ProjectSource =
  | {
      kind: 'image'
      fileName: string
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
      blobKey: string
    }
  | {
      kind: 'pdf'
      fileName: string
      mimeType: 'application/pdf'
      blobKey: string
    }

export interface Page {
  id: string
  index: number
  width: number
  height: number
  renderBlobKey?: string
}

interface HotspotBase {
  id: string
  pageId: string
  title: string
  description: string
  color?: string
  tags: string[]
  order: number
}

export interface PointHotspot extends HotspotBase {
  shape: 'point'
  x: number
  y: number
}

export interface RectHotspot extends HotspotBase {
  shape: 'rect'
  x: number
  y: number
  w: number
  h: number
}

export type Hotspot = PointHotspot | RectHotspot

export type ExportTheme = 'dark' | 'light'

export interface ProjectSettings {
  showBadgeNumbers: boolean
  /** Visual theme for the exported standalone HTML. Defaults to 'dark' when absent. */
  exportTheme?: ExportTheme
  /** Reserved for a later release. Runtime validation requires false in v1.0. */
  exportedListView: boolean
}

export interface Project {
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  source: ProjectSource | null
  pages: Page[]
  hotspots: Hotspot[]
  settings: ProjectSettings
}
