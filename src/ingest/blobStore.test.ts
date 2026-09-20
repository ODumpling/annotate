import { beforeEach, describe, expect, it } from 'vitest'
import { clearBlobs, deleteBlob, getBlob, putBlob } from './blobStore'

beforeEach(() => {
  clearBlobs()
})

describe('blobStore', () => {
  it('stores a blob under a generated key and retrieves it', () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    const key = putBlob(blob)

    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
    expect(getBlob(key)).toBe(blob)
  })

  it('generates distinct keys for distinct blobs', () => {
    const first = putBlob(new Blob(['a']))
    const second = putBlob(new Blob(['b']))

    expect(first).not.toBe(second)
  })

  it('returns undefined for an unknown key', () => {
    expect(getBlob('missing')).toBeUndefined()
  })

  it('deletes a blob by key', () => {
    const key = putBlob(new Blob(['a']))
    deleteBlob(key)

    expect(getBlob(key)).toBeUndefined()
  })

  it('clears every stored blob', () => {
    const first = putBlob(new Blob(['a']))
    const second = putBlob(new Blob(['b']))

    clearBlobs()

    expect(getBlob(first)).toBeUndefined()
    expect(getBlob(second)).toBeUndefined()
  })
})
