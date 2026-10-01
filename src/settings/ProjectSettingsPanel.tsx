import type { ChangeEvent } from 'react'
import { Settings2Icon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { ExportTheme, ProjectSettings } from '../model'
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

  function changeExportTheme(event: ChangeEvent<HTMLSelectElement>) {
    actions.updateProjectSettings({
      exportTheme: event.currentTarget.value as ExportTheme,
    })
  }

  return (
    <section
      aria-label="Project settings"
      className="w-full rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <Settings2Icon
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
        Settings
      </h2>
      <div className="flex flex-col gap-3 p-4">
        <Label className="min-h-8 cursor-pointer justify-between font-normal">
          Show badge numbers
          <input
            checked={settings.showBadgeNumbers}
            className="size-5 cursor-pointer rounded accent-primary"
            id="setting-show-badge-numbers"
            onChange={toggleShowBadgeNumbers}
            type="checkbox"
          />
        </Label>
        <div className="flex min-h-8 items-center justify-between gap-2">
          <Label className="font-normal" htmlFor="setting-export-theme">
            Export theme
          </Label>
          <NativeSelect
            id="setting-export-theme"
            onChange={changeExportTheme}
            value={settings.exportTheme ?? 'dark'}
          >
            <NativeSelectOption value="dark">Dark</NativeSelectOption>
            <NativeSelectOption value="light">Light</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
    </section>
  )
}
