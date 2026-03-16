import fs from 'fs-extra'
import path from 'path'
import { getGlobalConfigPath } from './paths.js'

export interface FeatureEntry {
  included: boolean
  provider?: string
  providerInstalled?: boolean
}

export interface ProjectConfig {
  $schemaVersion: number
  registry: string
  theme?: string
  projectType?: 'custom' | 'shipui-theme'
  features?: Record<string, FeatureEntry>
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

/**
 * Migrate v1 config to v2 by adding missing fields with defaults.
 */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  if (((raw.$schemaVersion as number) ?? 1) >= 2) return raw
  return {
    ...raw,
    $schemaVersion: 2,
    projectType: raw.projectType ?? 'custom',
  }
}

export function getProjectConfig(): ProjectConfig {
  const configPath = path.join(process.cwd(), 'shipui.json')

  if (fs.existsSync(configPath)) {
    let raw = fs.readJsonSync(configPath) as Record<string, unknown>
    raw = migrateV1ToV2(raw)
    return {
      $schemaVersion: (raw.$schemaVersion as number) ?? 2,
      registry: (raw.registry as string) ?? DEFAULT_REGISTRY,
      theme: raw.theme as string | undefined,
      projectType: (raw.projectType as 'custom' | 'shipui-theme') ?? 'custom',
      features: raw.features as Record<string, FeatureEntry> | undefined,
      paths: {
        components: (raw.paths as Record<string, string>)?.components ?? DEFAULT_PATHS.components,
        lib: (raw.paths as Record<string, string>)?.lib ?? DEFAULT_PATHS.lib,
        css: (raw.paths as Record<string, string>)?.css ?? DEFAULT_PATHS.css,
      },
      importAlias: (raw.importAlias as string) ?? DEFAULT_IMPORT_ALIAS,
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
    $schemaVersion: 2,
    registry: DEFAULT_REGISTRY,
    projectType: 'custom',
    paths,
    importAlias: DEFAULT_IMPORT_ALIAS,
  }
}

export function saveProjectConfig(config: ProjectConfig): void {
  const configPath = path.join(process.cwd(), 'shipui.json')
  fs.writeJsonSync(configPath, config, { spaces: 2 })
}

export function updateFeature(
  featureName: string,
  entry: FeatureEntry,
): void {
  const configPath = path.join(process.cwd(), 'shipui.json')
  if (!fs.existsSync(configPath)) return

  const raw = fs.readJsonSync(configPath) as Record<string, unknown>
  if (!raw.features) raw.features = {}
  ;(raw.features as Record<string, FeatureEntry>)[featureName] = entry
  fs.writeJsonSync(configPath, raw, { spaces: 2 })
}

/**
 * Detect if current directory is a valid Next.js project.
 * Returns 'nextjs' if Next.js is found, 'not-nextjs' if package.json exists but no Next.js,
 * or 'empty' if no package.json.
 */
export function detectProjectType(): 'nextjs' | 'not-nextjs' | 'empty' {
  const pkgPath = path.join(process.cwd(), 'package.json')
  if (!fs.existsSync(pkgPath)) return 'empty'

  try {
    const pkg = fs.readJsonSync(pkgPath) as Record<string, unknown>
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    }
    if (deps.next) return 'nextjs'
  } catch {
    // Invalid package.json
  }

  return 'not-nextjs'
}

/**
 * Detect if this is a ShipUI theme project by checking for theme CSS markers.
 */
export function detectThemeProject(cssPath: string): string | null {
  const fullPath = path.join(process.cwd(), cssPath)
  try {
    const css = fs.readFileSync(fullPath, 'utf-8')
    const match = css.match(/\/\* shipui:theme:(\w+):start \*\//)
    return match ? match[1] : null
  } catch {
    return null
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
