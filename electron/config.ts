import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ConfigForm, ConfigInput } from '../shared/types'

export interface AppConfig {
  deviceId: string
  supabase: { url: string; anonKey: string; email: string; password: string }
}

function filePath() {
  return path.join(app.getPath('userData'), 'bitezone-config.bin')
}

export function readConfig(): AppConfig | null {
  const target = filePath()
  if (!fs.existsSync(target)) return null
  const raw = fs.readFileSync(target)
  const marker = raw.subarray(0, 3).toString('utf8')
  const body = raw.subarray(3)
  const json = marker === 'BZ1' ? safeStorage.decryptString(body) : body.toString('utf8')
  return JSON.parse(json) as AppConfig
}

function writeConfig(config: AppConfig) {
  const json = JSON.stringify(config)
  const body = safeStorage.isEncryptionAvailable()
    ? Buffer.concat([Buffer.from('BZ1'), safeStorage.encryptString(json)])
    : Buffer.concat([Buffer.from('BZ0'), Buffer.from(json, 'utf8')])
  fs.mkdirSync(path.dirname(filePath()), { recursive: true })
  fs.writeFileSync(filePath(), body)
}

const emptySupabase = { url: '', anonKey: '', email: '', password: '' }

export function blankForm(): ConfigForm {
  return { supabaseUrl: '', email: '', hasAnonKey: false, hasSupabasePassword: false }
}

export function configForm(config: AppConfig | null): ConfigForm {
  if (!config) return blankForm()
  return {
    supabaseUrl: config.supabase?.url ?? '',
    email: config.supabase?.email ?? '',
    hasAnonKey: Boolean(config.supabase?.anonKey),
    hasSupabasePassword: Boolean(config.supabase?.password),
  }
}

export function ensureDevice() {
  const current = readConfig()
  if (current?.deviceId && current.supabase) return current
  const next: AppConfig = {
    deviceId: current?.deviceId ?? crypto.randomUUID(),
    supabase: current?.supabase ?? emptySupabase,
  }
  writeConfig(next)
  return next
}

export function supabaseReady(config: AppConfig | null) {
  return Boolean(config?.supabase?.url && config.supabase.anonKey && config.supabase.email && config.supabase.password)
}

export function saveConfig(input: ConfigInput) {
  const previous = ensureDevice()
  const url = input.supabaseUrl.trim().replace(/\/$/, '')
  if (!/^https:\/\//.test(url)) throw new Error('The website address should start with https://')
  const anonKey = input.anonKey.trim() || previous.supabase.anonKey
  const password = input.supabasePassword || previous.supabase.password
  const email = input.email.trim()
  if (!anonKey || !password || !email) throw new Error('Enter the website address, key, admin email, and admin password.')
  const next: AppConfig = { deviceId: previous.deviceId, supabase: { url, anonKey, email, password } }
  writeConfig(next)
  return next
}
