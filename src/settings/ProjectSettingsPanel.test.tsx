import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useStore } from 'zustand/react'
import { createProjectStore, type ProjectStore } from '../store'
import { ProjectSettingsPanel } from './ProjectSettingsPanel'

function SettingsHarness({ store }: { store: ProjectStore }) {
  const project = useStore(store, (state) => state.project)
  const actions = useStore(store, (state) => state.actions)
  return <ProjectSettingsPanel actions={actions} settings={project.settings} />
}

describe('ProjectSettingsPanel', () => {
  it('reflects the current showBadgeNumbers value', () => {
    const store = createProjectStore()
    store.getState().actions.createProject({ id: 'project', name: 'Panel' })
    render(<SettingsHarness store={store} />)

    const checkbox = screen.getByRole('checkbox', {
      name: 'Show badge numbers',
    }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('toggles showBadgeNumbers through the real store', () => {
    const store = createProjectStore()
    store.getState().actions.createProject({ id: 'project', name: 'Panel' })
    render(<SettingsHarness store={store} />)

    const checkbox = screen.getByRole('checkbox', {
      name: 'Show badge numbers',
    })
    fireEvent.click(checkbox)
    expect(store.getState().project.settings.showBadgeNumbers).toBe(false)

    fireEvent.click(checkbox)
    expect(store.getState().project.settings.showBadgeNumbers).toBe(true)
  })
})
