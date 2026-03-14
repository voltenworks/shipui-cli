import fs from 'fs-extra'
import path from 'path'
import type { RegistryFile } from './api.js'
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

  for (const file of files) {
    // Map file path: "components/ui/Button.tsx" -> "<config.paths.components>/ui/Button.tsx"
    let targetPath: string
    if (file.path.startsWith('components/')) {
      targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
    } else if (file.path.startsWith('lib/')) {
      targetPath = path.join(process.cwd(), config.paths.lib, file.path.slice('lib/'.length))
    } else {
      targetPath = path.join(process.cwd(), config.paths.components, file.path)
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
