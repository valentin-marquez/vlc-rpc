import type { IpcChannel, IpcEvent, IpcEventPayload, IpcRequest, IpcResponse } from "@shared/ipc"
import { ipcRenderer } from "electron"

/** Arguments and return type come from the channel map, so a bridge cannot drift from it. */
export function typedInvoke<C extends IpcChannel>(
	channel: C,
): (...args: IpcRequest<C>) => Promise<IpcResponse<C>> {
	return (...args: IpcRequest<C>) => ipcRenderer.invoke(channel, ...args)
}

/** Returns the unsubscribe function, which the caller has to run to drop the listener. */
export function onEvent<E extends IpcEvent>(
	event: E,
	callback: (payload: IpcEventPayload<E>) => void,
): () => void {
	const handler = (_: unknown, payload: IpcEventPayload<E>) => callback(payload)
	ipcRenderer.on(event, handler)
	return () => {
		ipcRenderer.removeListener(event, handler)
	}
}
