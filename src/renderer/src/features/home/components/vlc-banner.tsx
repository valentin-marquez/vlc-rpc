import { Warning } from "phosphor-react"
import type React from "react"

export interface VlcBannerProps {
	title: string
	body: string
	/** Secondary, never a tinted red: the banner already carries the alarm. */
	action?: React.ReactNode | undefined
}

export function VlcBanner({ title, body, action }: VlcBannerProps): JSX.Element {
	return (
		<div
			role="alert"
			className="flex items-start gap-3 rounded-md border border-danger/35 bg-danger-wash px-4 py-3"
		>
			<Warning
				size={16}
				weight="fill"
				aria-hidden="true"
				className="mt-[2px] shrink-0 text-danger"
			/>

			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<p className="type-label text-danger-text">{title}</p>
				<p className="type-caption text-pretty text-body">{body}</p>
				{action && <div className="mt-2">{action}</div>}
			</div>
		</div>
	)
}
