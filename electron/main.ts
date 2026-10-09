import path from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import type { ConfigInput, OrderFilter, PlaceOrderInput } from '../shared/types'
import { discardOrder, getDaySales, getOrder, listOrders, loadCounter, placeOrder } from './catalog'
import { configForm, readConfig, saveConfig } from './config'
import { closeDb, explainDb, getStatus } from './db'
import { exclusive } from './lock'
import { syncNow } from './sync'

app.setName('BiteZone Counter')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'BiteZone Counter',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = win
  win.on('closed', () => { mainWindow = null })
  if (process.env.BITEZONE_DEV === '1') void win.loadURL('http://127.0.0.1:5173')
  else void win.loadFile(path.join(__dirname, '../../dist/index.html'))
}

function guard<T>(fn: () => Promise<T>) {
  return fn().catch((error: unknown) => {
    throw explainDb(error)
  })
}

app.whenReady().then(() => {
  if (!gotLock) return
  ipcMain.handle('status', () => guard(() => getStatus()))
  ipcMain.handle('config:get', () => configForm(readConfig()))
  ipcMain.handle('config:save', (_event, input: ConfigInput) => exclusive(async () => {
    saveConfig(input)
    return getStatus()
  }))
  ipcMain.handle('counter:load', () => guard(() => loadCounter()))
  ipcMain.handle('order:place', (_event, input: PlaceOrderInput) => guard(() => placeOrder(input)))
  ipcMain.handle('orders:list', (_event, filter: OrderFilter) => guard(() => listOrders(filter)))
  ipcMain.handle('order:get', (_event, id: string) => guard(() => getOrder(id)))
  ipcMain.handle('order:discard', (_event, id: string) => guard(() => discardOrder(id)))
  ipcMain.handle('sales:day', (_event, day: string) => guard(() => getDaySales(day)))
  ipcMain.handle('sync', () => guard(() => syncNow()))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let closing = false
app.on('before-quit', (event) => {
  if (closing) return
  event.preventDefault()
  closing = true
  void closeDb().finally(() => app.quit())
})
