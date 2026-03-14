import { getGlobalConfig } from './config.js'

/**
 * Find the best token for a given theme slug.
 * Priority: env var > Pro > bundle > theme-specific.
 */
export function resolveToken(themeSlug: string, explicitToken?: string): string | null {
  // Explicit token from --token flag
  if (explicitToken) return explicitToken

  // Env var override
  if (process.env.SHIPUI_TOKEN) return process.env.SHIPUI_TOKEN

  const config = getGlobalConfig()
  const { tokens } = config

  // Priority: Pro > bundle > theme-specific
  if (tokens.theme_pro) return tokens.theme_pro
  if (tokens[`theme_${themeSlug}_bundle`]) return tokens[`theme_${themeSlug}_bundle`]
  if (tokens[`theme_${themeSlug}`]) return tokens[`theme_${themeSlug}`]

  return null
}
