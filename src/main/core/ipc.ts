import type { IpcChannel, IpcRequest, IpcResponse } from "@shared/ipc"
import { ipcMain } from "electron"

/**
 * The channel, its request args and its response all come from the
 * `IpcInvokeChannelMap` contract, so a handler that drifts from it fails to
 * compile rather than at runtime.
 */
export function registerHandler<C extends IpcChannel>(
	channel: C,
	handler: (...args: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>,
): void {
	ipcMain.handle(channel, (_event, ...args: IpcRequest<C>) => {
		return handler(...args)
	})
}
