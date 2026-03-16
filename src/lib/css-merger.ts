import fs from 'fs-extra'
import type { ThemeOverlay } from './api.js'

export interface MergeResult {
  action: 'appended' | 'skipped' | 'conflict'
  message: string
}

const THEME_START = (slug: string) => `/* shipui:theme:${slug}:start */`
const THEME_END = (slug: string) => `/* shipui:theme:${slug}:end */`
const COMPONENT_START = (id: string) => `/* shipui:component:${id}:start */`
const COMPONENT_END = (id: string) => `/* shipui:component:${id}:end */`

/**
 * Merge theme tokens and component CSS into globals.css using markers.
 */
export async function mergeCss(
  cssPath: string,
  componentName: string,
  theme: ThemeOverlay,
  options: { overwrite: boolean; force: boolean },
): Promise<MergeResult[]> {
  const results: MergeResult[] = []

  let css = ''
  if (await fs.pathExists(cssPath)) {
    css = await fs.readFile(cssPath, 'utf-8')
  }

  const componentId = `${theme.themeSlug}-${componentName}`

  // Check for theme block
  const themeStart = THEME_START(theme.themeSlug)
  const hasThemeBlock = css.includes(themeStart)

  // Check for a DIFFERENT theme block (conflict)
  const otherThemeMatch = css.match(/\/\* shipui:theme:([\w-]+):start \*\//)
  if (otherThemeMatch && otherThemeMatch[1] !== theme.themeSlug && !options.force) {
    results.push({
      action: 'conflict',
      message: `Theme "${otherThemeMatch[1]}" is already installed. Use --force to override with "${theme.themeSlug}" theme tokens.`,
    })
    return results
  }

  // Add theme tokens
  if (!hasThemeBlock && theme.themeTokens) {
    const themeBlock = `\n${themeStart}\n${theme.themeTokens}\n${THEME_END(theme.themeSlug)}\n`
    css += themeBlock
    results.push({ action: 'appended', message: `Added ${theme.themeName} theme tokens` })
  } else if (hasThemeBlock) {
    results.push({ action: 'skipped', message: `${theme.themeName} theme tokens already installed` })
  }

  // Add component CSS
  const componentStart = COMPONENT_START(componentId)
  const hasComponentBlock = css.includes(componentStart)

  if (!hasComponentBlock && theme.componentCss) {
    const componentBlock = `\n${componentStart}\n${theme.componentCss}\n${COMPONENT_END(componentId)}\n`
    css += componentBlock
    results.push({ action: 'appended', message: `Added ${componentName} CSS rules` })
  } else if (hasComponentBlock && !options.overwrite) {
    results.push({ action: 'skipped', message: `${componentName} CSS already installed` })
  } else if (hasComponentBlock && options.overwrite) {
    // Replace existing block
    const startIdx = css.indexOf(componentStart)
    const endMarker = COMPONENT_END(componentId)
    const endIdx = css.indexOf(endMarker) + endMarker.length
    css = css.slice(0, startIdx) + `${componentStart}\n${theme.componentCss}\n${endMarker}` + css.slice(endIdx)
    results.push({ action: 'appended', message: `Replaced ${componentName} CSS rules` })
  }

  await fs.writeFile(cssPath, css, 'utf-8')
  return results
}
