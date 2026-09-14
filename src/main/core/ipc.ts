import type { IpcChannel, IpcRequest, IpcResponse } from "@shared/ipc"
import { ipcMain } from "electron"

/**
 * Register a type-safe IPC invoke handler.
 *
 * The channel string, request args, and response type are all inferred from
 * the `IpcInvokeChannelMap` contract — changing a type in the contract will
 * cause a compile error here if the handler doesn't match.
 *
 * @example
 *   registerHandler("config:get", async (key?) => {
 *     return key ? configService.get(key) : configService.get()
 *   })
 */
export function registerHandler<C extends IpcChannel>(
	channel: C,
	handler: (...args: IpcRequest<C>) => Promise<IpcResponse<C>> | IpcResponse<C>,
): void {
	ipcMain.handle(channel, (_event, ...args: IpcRequest<C>) => {
		return handler(...args)
	})
}
