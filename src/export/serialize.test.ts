import { describe, expect, it } from 'vitest'
import { serializeScriptSafeJson, utf8ByteLength } from './serialize'

describe('script-safe JSON serialization', () => {
  it('escapes script-terminating sequences and round-trips them', () => {
    const hostile = {
      title: '</script><script>alert(1)</script>',
      end: '</SCRIPT',
      comment: '<!--',
    }
    const serialized = serializeScriptSafeJson(hostile)
    expect(serialized).not.toContain('<')
    expect(serialized).not.toContain('\u003c')
    expect(JSON.parse(serialized)).toEqual(hostile)
  })

  it('escapes U+2028 and U+2029 line separators', () => {
    const hostile = { title: 'a\u2028b\u2029c' }
    const serialized = serializeScriptSafeJson(hostile)
    expect(serialized).not.toContain('\u2028')
    expect(serialized).not.toContain('\u2029')
    expect(JSON.parse(serialized)).toEqual(hostile)
  })

  it('measures UTF-8 byte length', () => {
    expect(utf8ByteLength('annotate')).toBe(8)
    expect(utf8ByteLength('\u00e9')).toBe(2)
    expect(utf8ByteLength('\u20ac')).toBe(3)
    expect(utf8ByteLength('\ud83d\ude00')).toBe(4)
  })
})
