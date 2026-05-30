import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

export type Game = 'poe1' | 'poe2'

export interface DetectedClient {
  path: string
  game: Game
}

export type ClientEvent =
  | { type: 'zone'; zone: string; raw: string }
  | { type: 'level'; character: string; charClass: string; level: number; raw: string }
  | { type: 'login'; raw: string }

const api = {
  onClientEvent: (cb: (e: ClientEvent) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, event: ClientEvent): void => cb(event)
    ipcRenderer.on('client:event', listener)
    return () => ipcRenderer.off('client:event', listener)
  },
  quit: (): Promise<void> => ipcRenderer.invoke('overlay:quit'),
  setClickThrough: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('overlay:setClickThrough', enabled),
  getClickThrough: (): Promise<boolean> =>
    ipcRenderer.invoke('overlay:getClickThrough'),
  getClickThroughHotkey: (): Promise<string> =>
    ipcRenderer.invoke('overlay:getClickThroughHotkey'),
  onClickThroughChange: (cb: (enabled: boolean) => void): (() => void) => {
    const listener = (_: IpcRendererEvent, enabled: boolean): void => cb(enabled)
    ipcRenderer.on('overlay:clickThroughChanged', listener)
    return () => ipcRenderer.off('overlay:clickThroughChanged', listener)
  },
  getActiveClient: (): Promise<DetectedClient | null> =>
    ipcRenderer.invoke('overlay:getActiveClient'),
  listClients: (): Promise<DetectedClient[]> => ipcRenderer.invoke('overlay:listClients'),

  listDiskBuilds: (): Promise<unknown[]> => ipcRenderer.invoke('overlay:listDiskBuilds'),
  loadCustom: (buildId: string): Promise<unknown | null> =>
    ipcRenderer.invoke('overlay:loadCustom', buildId),
  saveCustom: (buildId: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke('overlay:saveCustom', buildId, data),
  getContentDirs: (): Promise<{ builds: string; customizations: string }> =>
    ipcRenderer.invoke('overlay:getContentDirs'),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('overlay:openExternal', url)
}

contextBridge.exposeInMainWorld('overlay', api)

export type OverlayApi = typeof api
