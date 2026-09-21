import { z, type ZodIssue } from 'zod'
import type { Project } from './types'

const nonEmptyString = z.string().min(1, 'must not be empty')
const finiteDimension = z.number().finite().positive()
const normalizedCoordinate = z.number().finite().min(0).max(1)
const nonNegativeInteger = z.number().int().nonnegative()
const isoTimestamp = z.string().refine(
  (value) => {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
  },
  { message: 'must be an ISO-8601 UTC timestamp' },
)

const imageSourceSchema = z.strictObject({
  kind: z.literal('image'),
  fileName: nonEmptyString,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  blobKey: nonEmptyString,
})

const pdfSourceSchema = z.strictObject({
  kind: z.literal('pdf'),
  fileName: nonEmptyString,
  mimeType: z.literal('application/pdf'),
  blobKey: nonEmptyString,
})

export const projectSourceSchema = z.discriminatedUnion('kind', [
  imageSourceSchema,
  pdfSourceSchema,
])

export const pageSchema = z.strictObject({
  id: nonEmptyString,
  index: nonNegativeInteger,
  width: finiteDimension,
  height: finiteDimension,
  renderBlobKey: nonEmptyString.optional(),
})

const hotspotBaseShape = {
  id: nonEmptyString,
  pageId: nonEmptyString,
  x: normalizedCoordinate,
  y: normalizedCoordinate,
  title: z.string(),
  description: z.string(),
  color: z.string().min(1).optional(),
  tags: z.array(z.string()),
  order: nonNegativeInteger,
}

export const pointHotspotSchema = z.strictObject({
  ...hotspotBaseShape,
  shape: z.literal('point'),
})

export const rectHotspotSchema = z
  .strictObject({
    ...hotspotBaseShape,
    shape: z.literal('rect'),
    w: normalizedCoordinate.refine((value) => value > 0, {
      message: 'must be greater than 0',
    }),
    h: normalizedCoordinate.refine((value) => value > 0, {
      message: 'must be greater than 0',
    }),
  })
  .superRefine((hotspot, context) => {
    if (hotspot.x + hotspot.w > 1) {
      context.addIssue({
        code: 'custom',
        path: ['w'],
        message: 'rectangle must remain within the page horizontally',
      })
    }
    if (hotspot.y + hotspot.h > 1) {
      context.addIssue({
        code: 'custom',
        path: ['h'],
        message: 'rectangle must remain within the page vertically',
      })
    }
  })

export const hotspotSchema = z.discriminatedUnion('shape', [
  pointHotspotSchema,
  rectHotspotSchema,
])

export const projectSettingsSchema = z.strictObject({
  showBadgeNumbers: z.boolean(),
  exportTheme: z.enum(['dark', 'light']).optional(),
  exportedListView: z.literal(false, {
    error: 'exportedListView is reserved and must be false in v1.0',
  }),
})

function addDuplicateIssues(
  values: string[],
  path: string,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: 'custom',
        path: [path, index, 'id'],
        message: `duplicate id: ${value}`,
      })
    }
    seen.add(value)
  })
}

export const projectSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: nonEmptyString,
    name: nonEmptyString,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    source: projectSourceSchema.nullable(),
    pages: z.array(pageSchema),
    hotspots: z.array(hotspotSchema),
    settings: projectSettingsSchema,
  })
  .superRefine((project, context) => {
    addDuplicateIssues(
      project.pages.map((page) => page.id),
      'pages',
      context,
    )
    addDuplicateIssues(
      project.hotspots.map((hotspot) => hotspot.id),
      'hotspots',
      context,
    )

    const pageIds = new Set(project.pages.map((page) => page.id))
    const sortedPageIndices = project.pages
      .map((page) => page.index)
      .sort((left, right) => left - right)

    sortedPageIndices.forEach((index, position) => {
      if (index !== position) {
        context.addIssue({
          code: 'custom',
          path: ['pages'],
          message: 'page indices must be unique and contiguous from 0',
        })
      }
    })

    project.hotspots.forEach((hotspot, index) => {
      if (!pageIds.has(hotspot.pageId)) {
        context.addIssue({
          code: 'custom',
          path: ['hotspots', index, 'pageId'],
          message: `references missing page: ${hotspot.pageId}`,
        })
      }
    })

    for (const page of project.pages) {
      const orderedHotspots = project.hotspots
        .filter((hotspot) => hotspot.pageId === page.id)
        .map((hotspot) => hotspot.order)
        .sort((left, right) => left - right)

      orderedHotspots.forEach((order, position) => {
        if (order !== position) {
          context.addIssue({
            code: 'custom',
            path: ['hotspots'],
            message: `hotspot order for page ${page.id} must be unique and contiguous from 0`,
          })
        }
      })
    }
  })

function formatIssue(issue: ZodIssue) {
  const path = issue.path.length === 0 ? '$' : `$.${issue.path.join('.')}`
  return `${path}: ${issue.message}`
}

export class ProjectValidationError extends Error {
  readonly issues: readonly string[]

  constructor(issues: readonly string[]) {
    super(`Invalid project:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
    this.name = 'ProjectValidationError'
    this.issues = issues
  }
}

/**
 * Zod is used because it provides strict runtime parsing, useful issue paths,
 * and composable cross-record refinements for persisted and exported projects.
 */
export function parseProject(input: unknown): Project {
  const result = projectSchema.safeParse(input)
  if (!result.success) {
    throw new ProjectValidationError(result.error.issues.map(formatIssue))
  }
  return result.data
}

export function parseProjectJson(json: string): Project {
  let input: unknown
  try {
    input = JSON.parse(json)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown JSON error'
    throw new ProjectValidationError([`$: invalid JSON (${message})`])
  }
  return parseProject(input)
}

export function serializeProject(project: Project): string {
  return JSON.stringify(parseProject(project))
}
