import { describe, expect, it } from 'vitest'
import { contrastRatio, meetsWcagAA } from './contrast'

/**
 * Tailwind's utility classes aren't loaded in the Vitest environment (no CSS
 * pipeline runs here), so automated tools like axe-core can't evaluate real
 * rendered contrast in unit tests. This records the actual color pairs the
 * app uses and checks them mathematically against WCAG AA instead. If a
 * color pair below changes, or a new one is introduced, it belongs here too.
 *
 * Tailwind v4 defines its palette in OKLCH (see node_modules/tailwindcss/
 * theme.css), not sRGB hex. These are the sRGB values that OKLCH resolves to
 * for the current display gamut (computed via the standard OKLab/OKLCH to
 * linear-sRGB conversion) — not the older Tailwind v3 sRGB-native palette,
 * which uses different values for the same names.
 */
const SLATE_950 = '#020618'
const SLATE_900 = '#0f172b'
const SLATE_800 = '#1d293d'
const SLATE_100 = '#f1f5f9'
const SLATE_400 = '#90a1b9'
const RED_400 = '#ff6467'
const RED_700 = '#c10007'
const AMBER_400 = '#ffb900'
const EMERALD_400 = '#00d492'
const WHITE = '#ffffff'
const BLUE_50 = '#eff6ff'

describe('app color pairs meet WCAG AA', () => {
  it.each([
    ['app body text (slate-100 on slate-950)', SLATE_100, SLATE_950, 'text'],
    ['app muted text (slate-400 on slate-950)', SLATE_400, SLATE_950, 'text'],
    ['app error text (red-400 on slate-950)', RED_400, SLATE_950, 'text'],
    ['app warning text (amber-400 on slate-950)', AMBER_400, SLATE_950, 'text'],
    [
      'app success text (emerald-400 on slate-950)',
      EMERALD_400,
      SLATE_950,
      'text',
    ],
    ['dialog/card text (slate-100 on slate-800)', SLATE_100, SLATE_800, 'text'],
    ['inspector default text (slate-900 on white)', SLATE_900, WHITE, 'text'],
    [
      'inspector selected-row text (slate-900 on blue-50)',
      SLATE_900,
      BLUE_50,
      'text',
    ],
    ['inspector error/delete text (red-700 on white)', RED_700, WHITE, 'text'],
  ] as const)('%s', (_label, foreground, background, usage) => {
    const ratio = contrastRatio(foreground, background)
    expect(meetsWcagAA(ratio, usage)).toBe(true)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#334155', '#334155')).toBeCloseTo(1, 5)
  })

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio(SLATE_100, SLATE_950)).toBeCloseTo(
      contrastRatio(SLATE_950, SLATE_100),
      10,
    )
  })
})
