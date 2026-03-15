import fs from 'fs-extra'
import path from 'path'
import { getGlobalConfigPath } from './paths.js'

export interface ProjectConfig {
  $schemaVersion: number
  registry: string
  theme?: string
  paths: {
    components: string
    lib: string
    css: string
  }
  importAlias: string
}

export interface GlobalConfig {
  tokens: Record<string, string>
}

const DEFAULT_REGISTRY = 'https://www.voltenworks.com/api/registry'

const DEFAULT_PATHS = {
  components: 'src/components',
  lib: 'src/lib',
  css: 'src/app/globals.css',
}

const DEFAULT_IMPORT_ALIAS = '@/'

export function getProjectConfig(): ProjectConfig {
  const configPath = path.join(process.cwd(), 'shipui.json')

  if (fs.existsSync(configPath)) {
    const raw = fs.readJsonSync(configPath) as Partial<ProjectConfig>
    return {
      $schemaVersion: raw.$schemaVersion ?? 1,
      registry: raw.registry ?? DEFAULT_REGISTRY,
      theme: (raw as Record<string, unknown>).theme as string | undefined,
      paths: {
        components: raw.paths?.components ?? DEFAULT_PATHS.components,
        lib: raw.paths?.lib ?? DEFAULT_PATHS.lib,
        css: raw.paths?.css ?? DEFAULT_PATHS.css,
      },
      importAlias: raw.importAlias ?? DEFAULT_IMPORT_ALIAS,
    }
  }

  // Auto-detect paths
  const paths = { ...DEFAULT_PATHS }
  if (fs.existsSync(path.join(process.cwd(), 'components'))) {
    paths.components = 'components'
  }
  if (fs.existsSync(path.join(process.cwd(), 'lib'))) {
    paths.lib = 'lib'
  }
  if (fs.existsSync(path.join(process.cwd(), 'app/globals.css'))) {
    paths.css = 'app/globals.css'
  }

  return {
    $schemaVersion: 1,
    registry: DEFAULT_REGISTRY,
    paths,
    importAlias: DEFAULT_IMPORT_ALIAS,
  }
}

export function getGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath()

  if (fs.existsSync(configPath)) {
    return fs.readJsonSync(configPath) as GlobalConfig
  }

  return { tokens: {} }
}

export function saveGlobalConfig(config: GlobalConfig): void {
  const configPath = getGlobalConfigPath()
  fs.ensureDirSync(path.dirname(configPath))
  fs.writeJsonSync(configPath, config, { spaces: 2 })
}
