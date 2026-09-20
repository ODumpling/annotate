import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  parseProject,
  type Hotspot,
  type Page,
  type Project,
  type ProjectSettings,
  type ProjectSource,
} from '../model'

const DEFAULT_SETTINGS: ProjectSettings = {
  showBadgeNumbers: true,
  exportedListView: false,
}

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainInvariantError'
  }
}

export interface CreateProjectInput {
  id: string
  name: string
  createdAt?: string
}

export type AddPageInput = Omit<Page, 'index'>
export type CreateHotspotInput =
  | Omit<Extract<Hotspot, { shape: 'point' }>, 'order'>
  | Omit<Extract<Hotspot, { shape: 'rect' }>, 'order'>

export interface HotspotContentPatch {
  title?: string
  description?: string
  color?: string
  tags?: string[]
}

export interface ProjectActions {
  createProject(input: CreateProjectInput): void
  resetProject(): void
  attachSource(source: ProjectSource): void
  replaceSource(source: ProjectSource): void
  addPage(page: AddPageInput): void
  removePage(pageId: string): void
  createHotspot(hotspot: CreateHotspotInput): void
  selectHotspot(hotspotId: string | null): void
  moveHotspot(hotspotId: string, x: number, y: number): void
  resizeHotspot(
    hotspotId: string,
    geometry: { x: number; y: number; w: number; h: number },
  ): void
  deleteHotspot(hotspotId: string): void
  updateHotspotContent(hotspotId: string, patch: HotspotContentPatch): void
  reorderWithinPage(pageId: string, orderedHotspotIds: string[]): void
  updateProjectSettings(patch: Partial<ProjectSettings>): void
}

export interface ProjectStoreState {
  project: Project
  selectedHotspotId: string | null
  actions: ProjectActions
}

export type ProjectStore = Pick<
  StoreApi<ProjectStoreState>,
  'getInitialState' | 'getState' | 'subscribe'
>

export interface ProjectStoreOptions {
  initialProject?: Project
  now?: () => string
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new DomainInvariantError(`${label} must be finite`)
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function pointGeometry(x: number, y: number) {
  assertFinite(x, 'x')
  assertFinite(y, 'y')
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

function rectGeometry(x: number, y: number, w: number, h: number) {
  assertFinite(x, 'x')
  assertFinite(y, 'y')
  assertFinite(w, 'w')
  assertFinite(h, 'h')
  if (w <= 0 || h <= 0) {
    throw new DomainInvariantError(
      'rectangle width and height must be positive',
    )
  }

  const clampedWidth = clamp(w, Number.EPSILON, 1)
  const clampedHeight = clamp(h, Number.EPSILON, 1)
  return {
    x: clamp(x, 0, 1 - clampedWidth),
    y: clamp(y, 0, 1 - clampedHeight),
    w: clampedWidth,
    h: clampedHeight,
  }
}

function blankProject(input: CreateProjectInput, now: () => string): Project {
  const timestamp = input.createdAt ?? now()
  return parseProject({
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: null,
    pages: [],
    hotspots: [],
    settings: DEFAULT_SETTINGS,
  })
}

function requirePage(project: Project, pageId: string) {
  if (!project.pages.some((page) => page.id === pageId)) {
    throw new DomainInvariantError(`page does not exist: ${pageId}`)
  }
}

function findHotspot(project: Project, hotspotId: string) {
  const hotspot = project.hotspots.find((item) => item.id === hotspotId)
  if (!hotspot) {
    throw new DomainInvariantError(`hotspot does not exist: ${hotspotId}`)
  }
  return hotspot
}

function reindexHotspots(hotspots: Hotspot[], pageId: string) {
  const orderById = new Map(
    hotspots
      .filter((hotspot) => hotspot.pageId === pageId)
      .sort((left, right) => left.order - right.order)
      .map((hotspot, order) => [hotspot.id, order]),
  )
  return hotspots.map((hotspot) =>
    hotspot.pageId === pageId
      ? { ...hotspot, order: orderById.get(hotspot.id)! }
      : hotspot,
  )
}

export function createProjectStore(
  options: ProjectStoreOptions = {},
): ProjectStore {
  const now = options.now ?? (() => new Date().toISOString())
  const initialProject = options.initialProject
    ? parseProject(options.initialProject)
    : blankProject({ id: 'local-draft', name: 'Untitled project' }, now)

  const store = createStore<ProjectStoreState>()((set, get) => {
    const commitProject = (candidate: Project) => {
      const project = parseProject({ ...candidate, updatedAt: now() })
      set({ project })
    }

    const actions: ProjectActions = {
      createProject(input) {
        set({
          project: blankProject(input, now),
          selectedHotspotId: null,
        })
      },

      resetProject() {
        const { project } = get()
        commitProject({
          ...project,
          source: null,
          pages: [],
          hotspots: [],
          settings: { ...DEFAULT_SETTINGS },
        })
        set({ selectedHotspotId: null })
      },

      attachSource(source) {
        const { project } = get()
        if (project.source !== null) {
          throw new DomainInvariantError(
            'project already has a source; use replaceSource',
          )
        }
        commitProject({ ...project, source })
      },

      replaceSource(source) {
        const { project } = get()
        commitProject({
          ...project,
          source,
          pages: [],
          hotspots: [],
        })
        set({ selectedHotspotId: null })
      },

      addPage(page) {
        const { project } = get()
        commitProject({
          ...project,
          pages: [...project.pages, { ...page, index: project.pages.length }],
        })
      },

      removePage(pageId) {
        const { project, selectedHotspotId } = get()
        requirePage(project, pageId)
        const removedHotspotIds = new Set(
          project.hotspots
            .filter((hotspot) => hotspot.pageId === pageId)
            .map((hotspot) => hotspot.id),
        )
        commitProject({
          ...project,
          pages: project.pages
            .filter((page) => page.id !== pageId)
            .map((page, index) => ({ ...page, index })),
          hotspots: project.hotspots.filter(
            (hotspot) => hotspot.pageId !== pageId,
          ),
        })
        if (selectedHotspotId && removedHotspotIds.has(selectedHotspotId)) {
          set({ selectedHotspotId: null })
        }
      },

      createHotspot(input) {
        const { project } = get()
        requirePage(project, input.pageId)
        const order = project.hotspots.filter(
          (hotspot) => hotspot.pageId === input.pageId,
        ).length
        const hotspot: Hotspot =
          input.shape === 'point'
            ? { ...input, ...pointGeometry(input.x, input.y), order }
            : {
                ...input,
                ...rectGeometry(input.x, input.y, input.w, input.h),
                order,
              }
        commitProject({
          ...project,
          hotspots: [...project.hotspots, hotspot],
        })
      },

      selectHotspot(hotspotId) {
        if (hotspotId !== null) {
          findHotspot(get().project, hotspotId)
        }
        set({ selectedHotspotId: hotspotId })
      },

      moveHotspot(hotspotId, x, y) {
        const { project } = get()
        const target = findHotspot(project, hotspotId)
        const geometry =
          target.shape === 'point'
            ? pointGeometry(x, y)
            : rectGeometry(x, y, target.w, target.h)
        commitProject({
          ...project,
          hotspots: project.hotspots.map((hotspot) =>
            hotspot.id === hotspotId ? { ...hotspot, ...geometry } : hotspot,
          ),
        })
      },

      resizeHotspot(hotspotId, geometry) {
        const { project } = get()
        const target = findHotspot(project, hotspotId)
        if (target.shape !== 'rect') {
          throw new DomainInvariantError('only rectangles can be resized')
        }
        const normalized = rectGeometry(
          geometry.x,
          geometry.y,
          geometry.w,
          geometry.h,
        )
        commitProject({
          ...project,
          hotspots: project.hotspots.map((hotspot) =>
            hotspot.id === hotspotId ? { ...hotspot, ...normalized } : hotspot,
          ),
        })
      },

      deleteHotspot(hotspotId) {
        const { project, selectedHotspotId } = get()
        const target = findHotspot(project, hotspotId)
        commitProject({
          ...project,
          hotspots: reindexHotspots(
            project.hotspots.filter((hotspot) => hotspot.id !== hotspotId),
            target.pageId,
          ),
        })
        if (selectedHotspotId === hotspotId) {
          set({ selectedHotspotId: null })
        }
      },

      updateHotspotContent(hotspotId, patch) {
        const { project } = get()
        findHotspot(project, hotspotId)
        commitProject({
          ...project,
          hotspots: project.hotspots.map((hotspot) =>
            hotspot.id === hotspotId ? { ...hotspot, ...patch } : hotspot,
          ),
        })
      },

      reorderWithinPage(pageId, orderedHotspotIds) {
        const { project } = get()
        requirePage(project, pageId)
        const currentIds = project.hotspots
          .filter((hotspot) => hotspot.pageId === pageId)
          .map((hotspot) => hotspot.id)
        if (
          orderedHotspotIds.length !== currentIds.length ||
          new Set(orderedHotspotIds).size !== currentIds.length ||
          orderedHotspotIds.some((id) => !currentIds.includes(id))
        ) {
          throw new DomainInvariantError(
            'reorder must contain every hotspot on the page exactly once',
          )
        }
        const orders = new Map(
          orderedHotspotIds.map((id, order) => [id, order]),
        )
        commitProject({
          ...project,
          hotspots: project.hotspots.map((hotspot) =>
            hotspot.pageId === pageId
              ? { ...hotspot, order: orders.get(hotspot.id)! }
              : hotspot,
          ),
        })
      },

      updateProjectSettings(patch) {
        if (patch.exportedListView === true) {
          throw new DomainInvariantError(
            'exportedListView is reserved and must remain false in v1.0',
          )
        }
        const { project } = get()
        commitProject({
          ...project,
          settings: { ...project.settings, ...patch },
        })
      },
    }

    return { project: initialProject, selectedHotspotId: null, actions }
  })

  return Object.freeze({
    getInitialState: store.getInitialState,
    getState: store.getState,
    subscribe: store.subscribe,
  })
}

export const projectStore = createProjectStore()
