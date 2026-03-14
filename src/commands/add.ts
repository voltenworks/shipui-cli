import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { parseInput } from '../lib/parse.js'
import { getProjectConfig } from '../lib/config.js'
import { resolveToken } from '../lib/auth.js'
import { fetchComponent, fetchRegistryIndex } from '../lib/api.js'
import { writeComponentFiles, writeUtility } from '../lib/writer.js'
import { mergeCss } from '../lib/css-merger.js'
import { detectPackageManager, getMissingDeps, installDeps } from '../lib/deps.js'
import { confirmOverwrite, confirmInstallDeps } from '../lib/prompts.js'

export const addCommand = new Command('add')
  .description('Add a ShipUI component to your project')
  .argument('<name>', 'Component name (e.g., button, badge, card)')
  .option('--theme <slug>', 'Apply theme styling (e.g., aloha, retro)')
  .option('--yes', 'Skip all confirmation prompts')
  .option('--overwrite', 'Overwrite existing files')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--force', 'Override theme conflict guard')
  .option('--token <token>', 'Authentication token')
  .action(async (name: string, options: {
    theme?: string
    yes?: boolean
    overwrite?: boolean
    dryRun?: boolean
    force?: boolean
    token?: string
  }) => {
    try {
      const config = getProjectConfig()

      // Get known themes for dash-syntax parsing
      let knownThemes: string[] | undefined
      try {
        const index = await fetchRegistryIndex(config.registry)
        const themeSlugs = new Set<string>()
        for (const c of index.components) {
          for (const t of c.themes) {
            themeSlugs.add(t.themeSlug)
          }
        }
        knownThemes = [...themeSlugs]
      } catch {
        // Proceed without known themes, dash syntax won't work
      }

      const parsed = parseInput(name, options.theme, knownThemes)

      console.log()
      if (options.dryRun) {
        console.log(chalk.yellow('DRY RUN, no files will be written\n'))
      }

      // Resolve token if theme is specified
      const token = parsed.themeSlug ? resolveToken(parsed.themeSlug, options.token) : null

      // Fetch component
      console.log(`Fetching ${parsed.componentName}${parsed.themeSlug ? ` with ${parsed.themeSlug} theme` : ''}...`)
      const manifest = await fetchComponent(config.registry, parsed.componentName, parsed.themeSlug, token)

      // Handle registry dependencies (e.g., utils)
      if (manifest.registryDependencies.includes('utils')) {
        const utilPath = await writeUtility(config, {
          overwrite: options.overwrite ?? false,
          dryRun: options.dryRun ?? false,
        })
        if (utilPath) {
          console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), utilPath)}`)
        }
      }

      // Check for existing files
      if (!options.overwrite && !options.yes) {
        for (const file of manifest.files) {
          let targetPath: string
          if (file.path.startsWith('components/')) {
            targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
          } else {
            targetPath = path.join(process.cwd(), config.paths.components, file.path)
          }
          const fsExtra = await import('fs-extra')
          if (fsExtra.default.existsSync(targetPath)) {
            const confirmed = await confirmOverwrite(path.relative(process.cwd(), targetPath))
            if (!confirmed) {
              console.log(chalk.yellow(`Skipped ${manifest.displayName}.`))
              return
            }
            options.overwrite = true
          }
        }
      }

      // Write component files
      const writeResult = await writeComponentFiles(manifest.files, config, {
        overwrite: options.overwrite ?? false,
        dryRun: options.dryRun ?? false,
      })

      for (const f of writeResult.written) {
        console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), f)}`)
      }
      for (const f of writeResult.skipped) {
        console.log(`  ${chalk.yellow('~')} ${path.relative(process.cwd(), f)} (exists, skipped)`)
      }

      // Merge CSS if theme is included
      if (manifest.theme) {
        const cssPath = path.join(process.cwd(), config.paths.css)
        const cssResults = await mergeCss(cssPath, parsed.componentName, manifest.theme, {
          overwrite: options.overwrite ?? false,
          force: options.force ?? false,
        })

        for (const r of cssResults) {
          if (r.action === 'appended') {
            console.log(`  ${chalk.green('+')} ${r.message}`)
          } else if (r.action === 'skipped') {
            console.log(`  ${chalk.yellow('~')} ${r.message}`)
          } else if (r.action === 'conflict') {
            console.log(`  ${chalk.red('!')} ${r.message}`)
            return
          }
        }
      }

      // Auto-install npm deps
      if (manifest.npmDependencies.length > 0 && !options.dryRun) {
        const missing = getMissingDeps(manifest.npmDependencies)
        if (missing.length > 0) {
          const pm = detectPackageManager()
          const shouldInstall = options.yes || await confirmInstallDeps(missing, pm)
          if (shouldInstall) {
            console.log(`\nInstalling dependencies with ${pm}...`)
            installDeps(missing, pm)
          } else {
            console.log(chalk.yellow(`\nSkipped installing: ${missing.join(', ')}`))
          }
        }
      }

      // Summary
      console.log()
      if (manifest.theme) {
        console.log(chalk.green(`Installed ${manifest.displayName} with ${manifest.theme.themeName} styling.`))
      } else if (manifest.themeAccess === 'unauthorized') {
        console.log(chalk.green(`Installed ${manifest.displayName} (base).`))
        console.log(chalk.yellow(`Premium ${manifest.themeSlug?.toUpperCase()} styling requires a purchase:`))
        console.log(chalk.cyan(manifest.purchaseUrl ?? ''))
        console.log(`\nOr run: ${chalk.bold('npx shipui login')} after purchasing.`)
      } else {
        console.log(chalk.green(`Installed ${manifest.displayName} (base).`))
        console.log(`Add theme styling: ${chalk.bold(`npx shipui add ${parsed.componentName} --theme <slug>`)}`)
      }

      // Usage example
      if (manifest.usage) {
        console.log(`\nUsage:`)
        console.log(chalk.dim(manifest.usage))
      }
      console.log()

    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })
