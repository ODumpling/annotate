import { describe, expect, it } from 'vitest'
import { exportFileName } from './filename'

describe('export filename normalization', () => {
  it.each([
    ['My Project', 'My-Project.html'],
    ['trailing space ', 'trailing-space.html'],
    ['../../etc/passwd', 'etc-passwd.html'],
    ['a<b>c:d"e|f?g*h', 'a-b-c-d-e-f-g-h.html'],
    ['', 'export.html'],
    ['   ', 'export.html'],
    ['...', 'export.html'],
    ['con', 'export-con.html'],
    ['NUL', 'export-NUL.html'],
    ['aux.notes', 'export-aux.notes.html'],
    ['Ünïcødé wörks', 'Ünïcødé-wörks.html'],
    ['line\u2028sep', 'line-sep.html'],
  ])('normalizes %j to %j', (name, expected) => {
    expect(exportFileName({ name })).toBe(expected)
  })

  it('caps long names and never produces an unsafe name', () => {
    const long = 'x'.repeat(300)
    const fileName = exportFileName({ name: long })
    expect(fileName.endsWith('.html')).toBe(true)
    expect(Array.from(fileName).length).toBeLessThanOrEqual(90)
    expect(fileName).toMatch(/^[^/\\:*?"<>|]+\.html$/)
  })
})
