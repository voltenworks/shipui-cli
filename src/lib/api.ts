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

export async function fetchRegistryIndex(registryUrl: string): Promise<RegistryIndex> {
  const response = await fetch(registryUrl)
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
  const url = new URL(`${registryUrl}/components/${name}`)
  if (themeSlug) url.searchParams.set('theme', themeSlug)

  const headers: Record<string, string> = {}
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

export async function validateToken(registryUrl: string, token: string): Promise<ValidateResponse> {
  const url = `${registryUrl}/validate?token=${encodeURIComponent(token)}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Validation failed: ${response.status}`)
  }
  return response.json() as Promise<ValidateResponse>
}
