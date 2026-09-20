import type { Project } from '../model'

const UNSAFE_CHARACTERS =
  /[\p{Cc}\u200b-\u200f\u2028\u2029\u3000\ufeff/\\:*?"<>|]/gu
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const MAX_CODE_POINTS = 80

export function exportFileName(project: Pick<Project, 'name'>): string {
  const cleaned = project.name
    .replace(UNSAFE_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .replace(/ /g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
  const defused = RESERVED_WINDOWS_NAME.test(cleaned)
    ? `export-${cleaned}`
    : cleaned
  const capped = Array.from(defused)
    .slice(0, MAX_CODE_POINTS)
    .join('')
    .replace(/[-.]+$/g, '')
  return `${capped || 'export'}.html`
}
