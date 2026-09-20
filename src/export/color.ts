import type { Hotspot } from '../model'

export const DEFAULT_MARKER_COLOR = '#2563eb'
const HEX_COLOR = /^#[0-9a-f]{6}$/

export function normalizeMarkerColor(color: Hotspot['color']): string {
  if (typeof color !== 'string') {
    return DEFAULT_MARKER_COLOR
  }
  const normalized = color.toLowerCase()
  return HEX_COLOR.test(normalized) ? normalized : DEFAULT_MARKER_COLOR
}
