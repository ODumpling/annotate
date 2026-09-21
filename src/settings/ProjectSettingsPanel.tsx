import type { ChangeEvent } from 'react'
import type { ProjectSettings } from '../model'
import type { ProjectActions } from '../store'

type SettingsActions = Pick<ProjectActions, 'updateProjectSettings'>

export interface ProjectSettingsPanelProps {
  settings: ProjectSettings
  actions: SettingsActions
}

export function ProjectSettingsPanel({
  settings,
  actions,
}: ProjectSettingsPanelProps) {
  function toggleShowBadgeNumbers(event: ChangeEvent<HTMLInputElement>) {
    actions.updateProjectSettings({
      showBadgeNumbers: event.currentTarget.checked,
    })
  }

  return (
    <section aria-label="Project settings" className="w-full max-w-md p-4">
      <h2 className="mb-3 text-lg font-semibold">Settings</h2>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={settings.showBadgeNumbers}
          className="min-h-6 min-w-6"
          id="setting-show-badge-numbers"
          onChange={toggleShowBadgeNumbers}
          type="checkbox"
        />
        Show badge numbers
      </label>
    </section>
  )
}
