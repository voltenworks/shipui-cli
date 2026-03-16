import fs from 'fs-extra'
import path from 'path'
import type { RegistryFile, ThemeFont } from './api.js'
import type { ProjectConfig } from './config.js'

export interface WriteResult {
  written: string[]
  skipped: string[]
}

/**
 * Write component files to the user's project.
 * Rewrites import aliases from @/ to the project's configured alias.
 */
export async function writeComponentFiles(
  files: RegistryFile[],
  config: ProjectConfig,
  options: { overwrite: boolean; dryRun: boolean },
): Promise<WriteResult> {
  const result: WriteResult = { written: [], skipped: [] }

  const projectRoot = path.resolve(process.cwd())

  for (const file of files) {
    // Validate path does not escape project directory
    if (path.isAbsolute(file.path) || path.normalize(file.path).startsWith('..')) {
      throw new Error(`Unsafe file path in component: ${file.path}`)
    }

    // Map file path: "components/ui/Button.tsx" -> "<config.paths.components>/ui/Button.tsx"
    let targetPath: string
    if (file.path.startsWith('components/')) {
      targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
    } else if (file.path.startsWith('lib/')) {
      targetPath = path.join(process.cwd(), config.paths.lib, file.path.slice('lib/'.length))
    } else {
      targetPath = path.join(process.cwd(), config.paths.components, file.path)
    }

    // Final check: resolved path must stay within project root
    if (path.relative(projectRoot, path.resolve(targetPath)).startsWith('..')) {
      throw new Error(`File path escapes project directory: ${file.path}`)
    }

    // Check if file exists
    if (fs.existsSync(targetPath) && !options.overwrite) {
      result.skipped.push(targetPath)
      continue
    }

    if (options.dryRun) {
      result.written.push(targetPath)
      continue
    }

    // Rewrite import aliases
    let content = file.content
    if (config.importAlias !== '@/') {
      content = content.replace(/@\//g, config.importAlias)
    }

    // Ensure directory exists and write
    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, content, 'utf-8')
    result.written.push(targetPath)
  }

  return result
}

/**
 * Write starter files to the user's project.
 * Maps paths: components/ -> config, lib/ -> config, hooks/ -> derived, app/ -> derived.
 */
export async function writeStarterFiles(
  files: RegistryFile[],
  config: ProjectConfig,
  options: { overwrite: boolean; dryRun: boolean; force: boolean },
): Promise<WriteResult> {
  const result: WriteResult = { written: [], skipped: [] }

  // Derive app and hooks paths from components path
  // If components is "src/components", app is "src/app", hooks is "src/hooks"
  // If components is "components", app is "app", hooks is "hooks"
  const prefix = config.paths.components.includes('/')
    ? config.paths.components.split('/').slice(0, -1).join('/') + '/'
    : ''

  const projectRoot = path.resolve(process.cwd())

  for (const file of files) {
    // Validate path does not escape project directory
    if (path.isAbsolute(file.path) || path.normalize(file.path).startsWith('..')) {
      throw new Error(`Unsafe file path in starter: ${file.path}`)
    }

    let targetPath: string
    if (file.path.startsWith('components/')) {
      targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
    } else if (file.path.startsWith('lib/')) {
      targetPath = path.join(process.cwd(), config.paths.lib, file.path.slice('lib/'.length))
    } else if (file.path.startsWith('app/')) {
      targetPath = path.join(process.cwd(), prefix + file.path)
    } else if (file.path.startsWith('hooks/')) {
      targetPath = path.join(process.cwd(), prefix + file.path)
    } else {
      targetPath = path.join(process.cwd(), prefix + file.path)
    }

    // Final check: resolved path must stay within project root
    if (path.relative(projectRoot, path.resolve(targetPath)).startsWith('..')) {
      throw new Error(`File path escapes project directory: ${file.path}`)
    }

    // Check if file exists (abort check happens before this function in add.ts)
    if (fs.existsSync(targetPath) && !options.overwrite && !options.force) {
      result.skipped.push(targetPath)
      continue
    }

    if (options.dryRun) {
      result.written.push(targetPath)
      continue
    }

    // Rewrite import aliases
    let content = file.content
    if (config.importAlias !== '@/') {
      content = content.replace(/@\//g, config.importAlias)
    }

    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, content, 'utf-8')
    result.written.push(targetPath)
  }

  return result
}

/**
 * Write the cn() utility to the project's lib directory.
 */
export async function writeUtility(config: ProjectConfig, options: { overwrite: boolean; dryRun: boolean }): Promise<string | null> {
  const utilPath = path.join(process.cwd(), config.paths.lib, 'utils.ts')

  if (fs.existsSync(utilPath) && !options.overwrite) {
    return null
  }

  const utilContent = `import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
`

  if (options.dryRun) return utilPath

  await fs.ensureDir(path.dirname(utilPath))
  await fs.writeFile(utilPath, utilContent, 'utf-8')
  return utilPath
}

/**
 * Update layout.tsx to load theme fonts.
 * Rewrites the font imports and body className to use theme-specific fonts.
 */
export async function updateLayoutFonts(
  config: ProjectConfig,
  fonts: ThemeFont[],
  options: { dryRun: boolean },
): Promise<string | null> {
  if (fonts.length === 0) return null

  const prefix = config.paths.components.includes('/')
    ? config.paths.components.split('/').slice(0, -1).join('/') + '/'
    : ''
  const layoutPath = path.join(process.cwd(), prefix + 'app/layout.tsx')

  if (!fs.existsSync(layoutPath)) return null
  if (options.dryRun) return layoutPath

  const content = await fs.readFile(layoutPath, 'utf-8')

  // Generate font imports
  const fontImports = fonts.map((f) => f.import).join(', ')
  const fontImportLine = `import { ${fontImports} } from 'next/font/google'`

  // Generate font config blocks
  const fontConfigs = fonts.map((f) => {
    const weightArr = f.weight.length === 1
      ? `'${f.weight[0]}'`
      : `[${f.weight.map((w) => `'${w}'`).join(', ')}]`
    const styleArr = f.style.length === 1 && f.style[0] === 'normal'
      ? ''
      : `,\n  style: [${f.style.map((s) => `'${s}'`).join(', ')}]`
    return `const ${f.import.charAt(0).toLowerCase() + f.import.slice(1).replace(/_/g, '')} = ${f.import}({
  weight: ${weightArr},
  subsets: ['latin'],
  variable: '${f.variable}'${styleArr},
})`
  })

  // Generate className
  const varNames = fonts.map((f) =>
    f.import.charAt(0).toLowerCase() + f.import.slice(1).replace(/_/g, '')
  )
  const classNameExpr = varNames.map((v) => `\${${v}.variable}`).join(' ')

  // Check if layout already has theme fonts (don't overwrite twice)
  if (fonts.some((f) => content.includes(f.variable))) {
    return null
  }

  let updated = content
  const hasExistingFontImport = /import\s*\{[^}]+\}\s*from\s*['"]next\/font\/google['"]/.test(content)

  if (hasExistingFontImport) {
    // Replace existing next/font/google import
    updated = updated.replace(
      /import\s*\{[^}]+\}\s*from\s*['"]next\/font\/google['"]/,
      fontImportLine,
    )

    // Replace font const blocks (between the import and metadata/export)
    const fontBlockRe = /const\s+\w+\s*=\s*\w+\([^)]*\);?\s*/g
    const existingBlocks = [...updated.matchAll(fontBlockRe)].filter((m) =>
      /(?:weight|subsets|variable)\s*:/.test(m[0]),
    )
    if (existingBlocks.length > 0) {
      const firstStart = existingBlocks[0].index!
      const lastEnd = existingBlocks[existingBlocks.length - 1].index! + existingBlocks[existingBlocks.length - 1][0].length
      updated = updated.slice(0, firstStart) + fontConfigs.join('\n\n') + '\n\n' + updated.slice(lastEnd)
    }
  } else {
    // No existing font import — insert after the last import line
    const importLines = [...updated.matchAll(/^import\s+.+$/gm)]
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1]
      const insertAt = lastImport.index! + lastImport[0].length
      const fontBlock = '\n' + fontImportLine + '\n\n' + fontConfigs.join('\n\n') + '\n'
      updated = updated.slice(0, insertAt) + fontBlock + updated.slice(insertAt)
    }
  }

  // Replace or append className on body tag
  if (/<body[^>]*className=\{`[^`]*`\}/.test(updated)) {
    // Append font variables to existing template literal content on body tag
    updated = updated.replace(
      /(<body[^>]*className=\{`)([^`]*)(`\})/,
      (_, prefix, existing) => {
        const trimmed = existing.trim()
        return trimmed
          ? `${prefix}${trimmed} ${classNameExpr}\`}`
          : `${prefix}${classNameExpr}\`}`
      },
    )
  } else if (/<body\s+className="([^"]*)"/.test(updated)) {
    // Convert string className to template literal and append
    updated = updated.replace(
      /<body\s+className="([^"]*)"/,
      `<body className={\`$1 ${classNameExpr}\`}`,
    )
  } else if (/<body\s+className=\{/.test(updated)) {
    // Handle JSX expression className with balanced-brace parsing to support nested braces
    const bodyMatch = updated.match(/<body\s+className=\{/)
    if (bodyMatch && bodyMatch.index !== undefined) {
      const braceStart = bodyMatch.index + bodyMatch[0].length - 1 // index of opening {
      let depth = 1
      let i = braceStart + 1
      while (i < updated.length && depth > 0) {
        if (updated[i] === '{') depth++
        else if (updated[i] === '}') depth--
        i++
      }
      if (depth === 0) {
        const existing = updated.slice(braceStart + 1, i - 1).trim()
        const before = updated.slice(0, bodyMatch.index)
        const after = updated.slice(i)
        // Preserve any other attributes that follow the className
        updated = `${before}<body className={\`\${${existing}} ${classNameExpr}\`}${after}`
      }
    }
  } else {
    // No className — add one to bare <body>
    updated = updated.replace(
      /<body>/,
      `<body className={\`${classNameExpr}\`}>`,
    )
  }

  await fs.writeFile(layoutPath, updated, 'utf-8')
  return layoutPath
}
