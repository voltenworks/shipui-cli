export interface ParsedInput {
  componentName: string
  themeSlug?: string
}

/**
 * Parse input into { componentName, themeSlug? }.
 * Supports: "button", "aloha/button", "aloha-button" (with known theme list)
 */
export function parseInput(input: string, themeFlag?: string, knownThemes?: string[]): ParsedInput {
  // --theme flag takes priority
  if (themeFlag) {
    return { componentName: input.toLowerCase(), themeSlug: themeFlag.toLowerCase() }
  }

  // Check for slash syntax: "aloha/button"
  if (input.includes('/')) {
    const [theme, ...rest] = input.split('/')
    return { componentName: rest.join('/').toLowerCase(), themeSlug: theme.toLowerCase() }
  }

  // Check for dash syntax: "aloha-button" (only if we know the theme list)
  // Sort by longest prefix first so "solar-dark" matches before "solar"
  if (knownThemes) {
    const sorted = [...knownThemes].sort((a, b) => b.length - a.length)
    for (const theme of sorted) {
      if (input.toLowerCase().startsWith(`${theme}-`)) {
        const componentName = input.slice(theme.length + 1).toLowerCase()
        if (componentName) {
          return { componentName, themeSlug: theme }
        }
      }
    }
  }

  // Plain component name
  return { componentName: input.toLowerCase() }
}
