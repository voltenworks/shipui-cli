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

export interface ThemeOverlay {
  themeSlug: string
  themeName: string
  themeTokens: string
  componentCss: string
  mode: 'light' | 'dark'
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
}

export interface ValidateResponse {
  valid: boolean
  product?: string
  email?: string
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
