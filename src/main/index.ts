import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import {
  detectClients,
  pickActiveClient,
  startClientWatcher,
  ClientEvent,
  DetectedClient
} from './client-watcher'
import {
  listDiskBuilds,
  loadCustom,
  saveCustom,
  getContentDirs
} from './disk-content'

let overlayWindow: BrowserWindow | null = null
let stopWatcher: (() => void) | null = null
let activeClient: DetectedClient | null = null
let clickThrough = false

const CLICK_THROUGH_HOTKEY = 'Alt+Shift+O'

function applyClickThrough(enabled: boolean): void {
  clickThrough = enabled
  overlayWindow?.setIgnoreMouseEvents(enabled, { forward: true })
  overlayWindow?.webContents.send('overlay:clickThroughChanged', enabled)
}

function createOverlay(): void {
  const primary = screen.getPrimaryDisplay()
  const width = 340
  const height = 220

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: primary.workArea.width - width - 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true)

  if (process.env.ELECTRON_RENDERER_URL) {
    overlayWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    overlayWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createOverlay()

  const detected = detectClients()
  console.log(`[main] detected clients:`, detected)
  activeClient = pickActiveClient(detected)

  if (activeClient) {
    console.log(`[main] watching ${activeClient.game}: ${activeClient.path}`)
    stopWatcher = startClientWatcher(activeClient, (event: ClientEvent) => {
      overlayWindow?.webContents.send('client:event', event)
    })
  } else {
    console.warn('[main] no PoE install detected')
  }

  ipcMain.handle('overlay:quit', () => app.quit())
  ipcMain.handle('overlay:setClickThrough', (_e, enabled: boolean) => {
    applyClickThrough(enabled)
  })
  ipcMain.handle('overlay:getClickThrough', () => clickThrough)
  ipcMain.handle('overlay:getClickThroughHotkey', () => CLICK_THROUGH_HOTKEY)
  ipcMain.handle('overlay:getActiveClient', () => activeClient)
  ipcMain.handle('overlay:listClients', () => detectClients())

  const ok = globalShortcut.register(CLICK_THROUGH_HOTKEY, () => {
    applyClickThrough(!clickThrough)
  })
  if (!ok) {
    console.warn(
      `[main] failed to register hotkey ${CLICK_THROUGH_HOTKEY} — another app may own it`
    )
  } else {
    console.log(`[main] click-through hotkey: ${CLICK_THROUGH_HOTKEY}`)
  }

  ipcMain.handle('overlay:listDiskBuilds', () => listDiskBuilds())
  ipcMain.handle('overlay:loadCustom', (_e, buildId: string) =>
    loadCustom(buildId)
  )
  ipcMain.handle('overlay:saveCustom', (_e, buildId: string, data: unknown) =>
    saveCustom(buildId, data)
  )
  ipcMain.handle('overlay:getContentDirs', () => getContentDirs())
  ipcMain.handle('overlay:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }
  })
})

app.on('before-quit', () => {
  stopWatcher?.()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
