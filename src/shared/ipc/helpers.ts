import type { IpcEventMap, IpcInvokeChannelMap } from "./channels"

export type IpcChannel = keyof IpcInvokeChannelMap
export type IpcRequest<C extends IpcChannel> = IpcInvokeChannelMap[C]["request"]
export type IpcResponse<C extends IpcChannel> = IpcInvokeChannelMap[C]["response"]

export type IpcEvent = keyof IpcEventMap
export type IpcEventPayload<E extends IpcEvent> = IpcEventMap[E]
