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
  if (knownThemes) {
    for (const theme of knownThemes) {
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
