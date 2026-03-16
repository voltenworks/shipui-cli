import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliPkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as { version: string }

export interface RegistryFile {
  path: string
  content: string
  hash: string
}

export interface ThemeFont {
  import: string
  name: string
  variable: string
  weight: string[]
  style: string[]
}

export interface ThemeOverlay {
  themeSlug: string
  themeName: string
  themeTokens: string
  componentCss: string
  mode: 'light' | 'dark'
  fonts?: ThemeFont[]
}

export interface ComponentManifest {
  version: number
  kind: 'component'
  name: string
  displayName: string
  files: RegistryFile[]
  registryDependencies: string[]
  npmDependencies: string[]
  theme: ThemeOverlay | null
  themeAccess?: 'unauthorized'
  themeSlug?: string
  purchaseUrl?: string
  usage: string
  variantSnippets: string[]
  updatedAt: string
}

export interface RegistryIndex {
  version: number
  minCliVersion?: string
  components: {
    name: string
    displayName: string
    category: string
    description: string
    tags: string[]
    themes: {
      themeSlug: string
      themeName: string
      free: boolean
      themePrice: number
    }[]
  }[]
  starters?: StarterIndexEntry[]
}

export interface ValidateResponse {
  valid: boolean
  product?: string
  email?: string
}

export interface StarterProvider {
  name: string
  displayName: string
  env: string[]
  postInstall: string[]
  notes: string | null
}

export interface StarterManifest {
  version: number
  kind: 'starter'
  name: string
  displayName: string
  files: RegistryFile[]
  registryDependencies: string[]
  npmDependencies: string[]
  theme: ThemeOverlay | null
  themeAccess?: 'unauthorized'
  themeSlug?: string
  purchaseUrl?: string
  provider: StarterProvider | null
  usage: string | null
  variantSnippets: string[]
  updatedAt: string
}

export interface StarterIndexEntry {
  name: string
  displayName: string
  category: string
  description: string
  providers: string[]
}

export interface BlueprintFile {
  path: string
  content: string
  hash: string
}

export interface BlueprintManifest {
  version: number
  kind: 'blueprint'
  slug: string
  themeId: string
  themeName: string
  mode: 'light' | 'dark'
  accentColor: string | null
  fonts: ThemeFont[]
  features: {
    hasAuth: boolean
    hasDashboard: boolean
    hasForgotPassword: boolean
  }
  npmDependencies?: string[]
  files: BlueprintFile[]
  updatedAt: string
}

/** Ensure URL ends with trailing slash to avoid redirects that strip auth headers. */
function withTrailingSlash(url: string): string {
  const [base, query] = url.split('?')
  const slashed = base.endsWith('/') ? base : base + '/'
  return query ? `${slashed}?${query}` : slashed
}

export async function fetchRegistryIndex(registryUrl: string): Promise<RegistryIndex> {
  const response = await fetch(withTrailingSlash(registryUrl), {
    headers: { 'x-shipui-cli-version': cliPkg.version },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch registry index: ${response.status}`)
  }
  return response.json() as Promise<RegistryIndex>
}

export async function fetchComponent(
  registryUrl: string,
  name: string,
  themeSlug?: string,
  token?: string | null,
): Promise<ComponentManifest> {
  const url = new URL(`${registryUrl}/components/${name}/`)
  if (themeSlug) url.searchParams.set('theme', themeSlug)

  const headers: Record<string, string> = {
    'x-shipui-cli-version': cliPkg.version,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(url.toString(), { headers })
  if (response.status === 404) {
    throw new Error(`Component "${name}" not found. Run \`npx @voltenworks/shipui list\` to see available components.`)
  }
  if (!response.ok) {
    throw new Error(`Registry error: ${response.status}`)
  }
  return response.json() as Promise<ComponentManifest>
}

export async function fetchStarter(
  registryUrl: string,
  name: string,
  themeSlug?: string,
  provider?: string,
  token?: string | null,
): Promise<StarterManifest> {
  const url = new URL(`${registryUrl}/starters/${name}/`)
  if (themeSlug) url.searchParams.set('theme', themeSlug)
  if (provider) url.searchParams.set('provider', provider)

  const headers: Record<string, string> = {
    'x-shipui-cli-version': cliPkg.version,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(url.toString(), { headers })
  if (response.status === 404) {
    throw new Error(`Starter "${name}" not found. Run \`npx @voltenworks/shipui list\` to see available starters.`)
  }
  if (response.status === 400) {
    let message = `Bad request: ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body.error) message = body.error
    } catch { /* non-JSON response */ }
    throw new Error(message)
  }
  if (!response.ok) {
    throw new Error(`Registry error: ${response.status}`)
  }
  return response.json() as Promise<StarterManifest>
}

export async function fetchBlueprint(
  registryUrl: string,
  slug: string,
  token?: string | null,
): Promise<BlueprintManifest> {
  const url = new URL(`${registryUrl}/blueprints/${slug}/`)

  const headers: Record<string, string> = {
    'x-shipui-cli-version': cliPkg.version,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const response = await fetch(url.toString(), { headers })
  if (response.status === 404) {
    throw new Error(`Theme "${slug}" not found.`)
  }
  if (response.status === 403) {
    let errorMsg = 'Authentication required'
    let purchaseUrl = ''
    try {
      const body = await response.json() as { error?: string; purchaseUrl?: string }
      if (body.error) errorMsg = body.error
      if (body.purchaseUrl) purchaseUrl = body.purchaseUrl
    } catch { /* non-JSON response */ }
    throw new Error(
      `${errorMsg}.${purchaseUrl ? ` Purchase at: ${purchaseUrl}` : ''}\nRun \`npx @voltenworks/shipui login\` after purchasing.`,
    )
  }
  if (!response.ok) {
    throw new Error(`Registry error: ${response.status}`)
  }
  return response.json() as Promise<BlueprintManifest>
}

export async function fetchRegistryIndexCached(registryUrl: string): Promise<RegistryIndex> {
  const { getCachedRegistry, setCachedRegistry } = await import('./cache.js')
  const cached = getCachedRegistry()
  if (cached) return cached

  const data = await fetchRegistryIndex(registryUrl)
  setCachedRegistry(data)
  return data
}

export async function validateToken(registryUrl: string, token: string): Promise<ValidateResponse> {
  const url = `${registryUrl}/validate/?token=${encodeURIComponent(token)}`
  const response = await fetch(url, {
    headers: { 'x-shipui-cli-version': cliPkg.version },
  })
  if (!response.ok) {
    throw new Error(`Validation failed: ${response.status}`)
  }
  return response.json() as Promise<ValidateResponse>
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function checkMinVersion(index: RegistryIndex): void {
  if (!index.minCliVersion) return
  if (compareSemver(cliPkg.version, index.minCliVersion) < 0) {
    console.log(
      chalk.yellow(
        `\nYour CLI (v${cliPkg.version}) is older than the minimum recommended version (v${index.minCliVersion}).`
      )
    )
    console.log(
      chalk.yellow('Update with: npm install -g @voltenworks/shipui@latest\n')
    )
  }
}
