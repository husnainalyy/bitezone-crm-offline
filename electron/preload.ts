import { contextBridge, ipcRenderer } from 'electron'
import type { ConfigInput, DesktopApi, OrderFilter, PlaceOrderInput } from '../shared/types'

const api: DesktopApi = {
  getStatus: () => ipcRenderer.invoke('status'),
  getConfigForm: () => ipcRenderer.invoke('config:get'),
  saveConfig: (input: ConfigInput) => ipcRenderer.invoke('config:save', input),
  loadCounter: () => ipcRenderer.invoke('counter:load'),
  placeOrder: (input: PlaceOrderInput) => ipcRenderer.invoke('order:place', input),
  listOrders: (filter: OrderFilter) => ipcRenderer.invoke('orders:list', filter),
  getOrder: (id: string) => ipcRenderer.invoke('order:get', id),
  discardOrder: (id: string) => ipcRenderer.invoke('order:discard', id),
  sync: () => ipcRenderer.invoke('sync'),
}

contextBridge.exposeInMainWorld('bitezone', api)
