import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from 'zustand/react'
import { createProjectStore, type ProjectStore } from '../store'
import {
  DESCRIPTION_MAX_GRAPHEMES,
  HotspotInspector,
  TITLE_MAX_GRAPHEMES,
} from './HotspotInspector'

function createInspectorStore() {
  const store = createProjectStore()
  const actions = store.getState().actions
  actions.createProject({ id: 'project', name: 'Inspector' })
  actions.addPage({ id: 'page-1', width: 800, height: 600 })
  actions.addPage({ id: 'page-2', width: 400, height: 300 })
  for (const [id, title] of [
    ['one', 'One'],
    ['two', 'Two'],
    ['three', 'Three'],
  ]) {
    actions.createHotspot({
      id,
      pageId: 'page-1',
      shape: 'point',
      x: 0.5,
      y: 0.5,
      title,
      description: '',
      tags: [],
    })
  }
  actions.createHotspot({
    id: 'other-page',
    pageId: 'page-2',
    shape: 'point',
    x: 0.5,
    y: 0.5,
    title: 'Other page',
    description: '',
    tags: [],
  })
  return store
}

function InspectorHarness({ store }: { store: ProjectStore }) {
  const project = useStore(store, (state) => state.project)
  const selectedHotspotId = useStore(store, (state) => state.selectedHotspotId)
  const actions = useStore(store, (state) => state.actions)
  return (
    <HotspotInspector
      actions={actions}
      hotspots={project.hotspots}
      pageId="page-1"
      selectedHotspotId={selectedHotspotId}
    />
  )
}

function pageOne(store: ProjectStore) {
  return store
    .getState()
    .project.hotspots.filter((hotspot) => hotspot.pageId === 'page-1')
    .toSorted((left, right) => left.order - right.order)
}

describe('HotspotInspector', () => {
  it('lists only the active page and keeps viewport-driven selection visible', () => {
    const store = createInspectorStore()
    store.getState().actions.selectHotspot('two')
    render(<InspectorHarness store={store} />)

    expect(screen.queryByRole('button', { name: 'Other page' })).toBeNull()
    const selectedRow = screen
      .getByRole('button', { name: 'Two' })
      .closest('li')
    expect(selectedRow?.dataset.selected).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'One' }))
    expect(store.getState().selectedHotspotId).toBe('one')
  })

  it('reorders through the real store with contiguous unique orders', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)

    expect(
      screen
        .getByRole('button', { name: /move one up/i })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: /move three down/i })
        .hasAttribute('disabled'),
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: /move one down/i }))
    expect(pageOne(store).map((hotspot) => hotspot.id)).toEqual([
      'two',
      'one',
      'three',
    ])
    fireEvent.click(screen.getByRole('button', { name: /move three up/i }))

    const reordered = pageOne(store)
    expect(reordered.map((hotspot) => hotspot.id)).toEqual([
      'two',
      'three',
      'one',
    ])
    expect(reordered.map((hotspot) => hotspot.order)).toEqual([0, 1, 2])
    expect(new Set(reordered.map((hotspot) => hotspot.order)).size).toBe(3)
  })

  it('writes fields and normalized tags through the real store', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)
    const row = screen.getByRole('button', { name: 'One' }).closest('li')!

    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: 'Updated title' },
    })
    fireEvent.change(within(row).getByLabelText('Description'), {
      target: { value: '**raw Markdown**' },
    })
    fireEvent.change(within(row).getByLabelText('Tags'), {
      target: { value: 'review, navigation, review,  ' },
    })
    fireEvent.blur(within(row).getByLabelText('Tags'))

    expect(pageOne(store)[0]).toMatchObject({
      title: 'Updated title',
      description: '**raw Markdown**',
      tags: ['review', 'navigation'],
    })
  })

  it('accepts and canonicalizes only six-digit hex colors', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)
    const row = screen.getByRole('button', { name: 'One' }).closest('li')!
    const color = within(row).getByLabelText('Color')

    fireEvent.change(color, { target: { value: '#a1b2c3' } })
    fireEvent.blur(color)
    expect(pageOne(store)[0].color).toBe('#A1B2C3')

    const updatedColor = within(row).getByLabelText('Color')
    fireEvent.change(updatedColor, { target: { value: 'red' } })
    fireEvent.blur(updatedColor)
    expect(pageOne(store)[0].color).toBe('#A1B2C3')
    expect(within(row).getByRole('alert').textContent).toMatch(
      /six-digit hex color/i,
    )
  })

  it('allows an empty title and normalizes whitespace-only descriptions', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)
    const row = screen.getByRole('button', { name: 'One' }).closest('li')!

    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: '' },
    })
    const renamedRow = screen
      .getByRole('button', { name: 'Hotspot 1' })
      .closest('li')!
    fireEvent.change(within(renamedRow).getByLabelText('Description'), {
      target: { value: '   \n  ' },
    })

    expect(pageOne(store)[0]).toMatchObject({ title: '', description: '' })
  })

  it('rejects title and description values over their grapheme limits', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)
    const row = screen.getByRole('button', { name: 'One' }).closest('li')!

    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: 'a'.repeat(TITLE_MAX_GRAPHEMES + 1) },
    })
    fireEvent.change(within(row).getByLabelText('Description'), {
      target: { value: 'b'.repeat(DESCRIPTION_MAX_GRAPHEMES + 1) },
    })

    expect(pageOne(store)[0]).toMatchObject({ title: 'One', description: '' })
    expect(within(row).getAllByRole('alert')).toHaveLength(2)
  })

  it('counts user-perceived graphemes rather than UTF-16 code units', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)
    const row = screen.getByRole('button', { name: 'One' }).closest('li')!
    const family = '👨‍👩‍👧‍👦'

    fireEvent.change(within(row).getByLabelText('Title'), {
      target: { value: family.repeat(TITLE_MAX_GRAPHEMES) },
    })

    expect(pageOne(store)[0].title).toBe(family.repeat(TITLE_MAX_GRAPHEMES))
  })

  it('deletes a hotspot through the real store', () => {
    const store = createInspectorStore()
    render(<InspectorHarness store={store} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Two' }))
    expect(pageOne(store).map((hotspot) => hotspot.id)).toEqual([
      'one',
      'three',
    ])
    expect(pageOne(store).map((hotspot) => hotspot.order)).toEqual([0, 1])
  })
})
