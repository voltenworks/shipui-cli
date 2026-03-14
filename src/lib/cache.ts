import fs from 'fs-extra'
import path from 'path'
import { getGlobalConfigPath } from './paths.js'
import type { RegistryIndex } from './api.js'

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface CacheEntry {
  timestamp: number
  data: RegistryIndex
}

function getCachePath(): string {
  const configPath = getGlobalConfigPath()
  return path.join(path.dirname(configPath), 'cache', 'registry.json')
}

export function getCachedRegistry(): RegistryIndex | null {
  const cachePath = getCachePath()
  if (!fs.existsSync(cachePath)) return null

  try {
    const entry = fs.readJsonSync(cachePath) as CacheEntry
    if (Date.now() - entry.timestamp > CACHE_TTL) return null
    return entry.data
  } catch {
    return null
  }
}

export function setCachedRegistry(data: RegistryIndex): void {
  const cachePath = getCachePath()
  fs.ensureDirSync(path.dirname(cachePath))
  fs.writeJsonSync(cachePath, { timestamp: Date.now(), data }, { spaces: 2 })
}
