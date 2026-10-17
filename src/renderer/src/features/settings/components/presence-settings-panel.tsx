import { Panel, Row } from "@renderer/components/ui/panel"
import { Switch } from "@renderer/components/ui/switch"
import { saveConfig } from "@renderer/stores/config.store"
import { useState } from "react"

export function PresenceSettingsPanel({
	hideWhenPaused,
}: { hideWhenPaused: boolean }): JSX.Element {
	const [saving, setSaving] = useState(false)
	const [failed, setFailed] = useState(false)

	async function handleChange(checked: boolean): Promise<void> {
		setSaving(true)
		setFailed(false)
		try {
			await saveConfig("hideWhenPaused", checked)
		} catch {
			setFailed(true)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Panel label="Presence">
			<Row
				htmlFor="hideWhenPaused"
				label="Hide activity when paused"
				description="Remove your Discord activity while VLC is paused. It returns when playback resumes."
				control={
					<Switch
						id="hideWhenPaused"
						checked={hideWhenPaused ?? false}
						disabled={saving}
						onChange={(event) => handleChange(event.currentTarget.checked)}
					/>
				}
			/>
			{failed && (
				<p role="alert" className="type-caption px-4 py-3 text-danger-text">
					Could not save your presence settings. Try again.
				</p>
			)}
		</Panel>
	)
}
