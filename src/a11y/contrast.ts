function channelLuminance(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance([r, g, b]: readonly [
  number,
  number,
  number,
]): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) {
    throw new Error(`expected a #rrggbb color, got ${hex}`)
  }
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/** WCAG 2.x contrast ratio between two sRGB hex colors, in the range 1..21. */
export function contrastRatio(foreground: string, background: string): number {
  const fgLuminance = relativeLuminance(hexToRgb(foreground))
  const bgLuminance = relativeLuminance(hexToRgb(background))
  const lighter = Math.max(fgLuminance, bgLuminance)
  const darker = Math.min(fgLuminance, bgLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG 2.x SC 1.4.3 (AA): 4.5:1 for normal text, 3:1 for large text
 * (>=24px, or >=19px bold) and for UI component/graphical object contrast
 * against adjacent colors (SC 1.4.11).
 */
export function meetsWcagAA(
  ratio: number,
  usage: 'text' | 'large-text-or-ui',
): boolean {
  return ratio >= (usage === 'text' ? 4.5 : 3)
}
