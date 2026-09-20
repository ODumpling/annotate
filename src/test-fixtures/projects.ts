import type { Project } from '../model'

const TIMESTAMP = '2026-09-20T12:00:00.000Z'

/**
 * Shared image project for preview/export interaction-contract tests.
 * Consumers that mutate fixture data should clone it first.
 */
export const PREVIEW_FIXTURE_PROJECT: Project = {
  schemaVersion: 1,
  id: 'preview-fixture',
  name: 'Museum floor plan review',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  source: {
    kind: 'image',
    fileName: 'museum-floor-plan.png',
    mimeType: 'image/png',
    blobKey: 'fixture-image',
  },
  pages: [
    {
      id: 'ground-floor',
      index: 0,
      width: 1200,
      height: 800,
    },
  ],
  hotspots: [
    {
      id: 'entrance',
      pageId: 'ground-floor',
      shape: 'point',
      x: 0.18,
      y: 0.72,
      title: 'Main entrance',
      description:
        'Visitors enter through the **south doors**. See the [arrival guide](https://example.com/arrival) before opening.',
      color: '#2563EB',
      tags: ['arrival', 'accessibility'],
      order: 0,
    },
    {
      id: 'gallery',
      pageId: 'ground-floor',
      shape: 'rect',
      x: 0.42,
      y: 0.2,
      w: 0.32,
      h: 0.28,
      title:
        'Temporary exhibition gallery with an intentionally long descriptive title that exceeds the compact preview limit',
      description:
        'This **temporary gallery** contains rotating exhibits, visitor seating, and a quiet interpretation area.\n\nThe complete description remains available in the detail card even when the compact hover summary shortens this text for display. Additional wayfinding notes help visitors understand the route without relying on hover.',
      color: '#7C3AED',
      tags: ['gallery', 'quiet-space'],
      order: 1,
    },
    {
      id: 'lift',
      pageId: 'ground-floor',
      shape: 'point',
      x: 0.83,
      y: 0.54,
      title: '',
      description: 'Step-free access to every public floor.',
      tags: ['accessibility'],
      order: 2,
    },
  ],
  settings: {
    showBadgeNumbers: true,
    exportedListView: false,
  },
}
