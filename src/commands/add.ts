import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { parseInput } from '../lib/parse.js'
import { getProjectConfig } from '../lib/config.js'
import { resolveToken } from '../lib/auth.js'
import {
  fetchComponent,
  fetchStarter,
  fetchRegistryIndexCached,
  checkMinVersion,
  type StarterManifest,
} from '../lib/api.js'
import { writeComponentFiles, writeStarterFiles, writeUtility, updateLayoutFonts } from '../lib/writer.js'
import { mergeCss } from '../lib/css-merger.js'
import { detectPackageManager, getMissingDeps, installDeps, checkTailwind } from '../lib/deps.js'
import { confirmOverwrite, confirmInstallDeps } from '../lib/prompts.js'

export const addCommand = new Command('add')
  .description('Add a ShipUI component or starter to your project')
  .argument('<name>', 'Component or starter name (e.g., button, auth, dashboard)')
  .option('--theme <slug>', 'Apply theme styling (e.g., aloha, retro)')
  .option('--provider <name>', 'Select starter provider (e.g., clerk, stub)')
  .option('--yes', 'Skip all confirmation prompts')
  .option('--overwrite', 'Overwrite existing files')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--force', 'Override theme conflict guard')
  .option('--token <token>', 'Authentication token')
  .action(async (name: string, options: {
    theme?: string
    provider?: string
    yes?: boolean
    overwrite?: boolean
    dryRun?: boolean
    force?: boolean
    token?: string
  }) => {
    try {
      const config = getProjectConfig()

      // Apply default theme from shipui.json if --theme not specified
      if (!options.theme && config.theme) {
        options.theme = config.theme
      }

      // Get registry index
      let knownThemes: string[] | undefined
      let starterNames: string[] = []
      try {
        const index = await fetchRegistryIndexCached(config.registry)
        checkMinVersion(index)
        const themeSlugs = new Set<string>()
        for (const c of index.components) {
          for (const t of c.themes) {
            themeSlugs.add(t.themeSlug)
          }
        }
        knownThemes = [...themeSlugs]
        starterNames = (index.starters ?? []).map((s) => s.name)
      } catch {
        // Proceed without
      }

      // Check if this is a starter
      const isStarter = starterNames.includes(name.toLowerCase())

      if (isStarter) {
        await installStarter(name.toLowerCase(), config, options)
      } else {
        await installComponent(name, config, options, knownThemes)
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

// ---------- Component install (existing logic) ----------

async function installComponent(
  name: string,
  config: ReturnType<typeof getProjectConfig>,
  options: {
    theme?: string
    provider?: string
    yes?: boolean
    overwrite?: boolean
    dryRun?: boolean
    force?: boolean
    token?: string
  },
  knownThemes?: string[],
) {
  const parsed = parseInput(name, options.theme, knownThemes)

  console.log()
  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN, no files will be written\n'))
  }

  // Check for Tailwind v4
  const twStatus = checkTailwind()
  if (twStatus === 'missing') {
    console.log(chalk.yellow('Warning: Tailwind CSS v4 is not installed. ShipUI components require Tailwind v4 for theme tokens to work.'))
    console.log(chalk.dim('Install it with: npm install tailwindcss @tailwindcss/postcss\n'))
  } else if (twStatus === 'outdated') {
    console.log(chalk.yellow('Warning: ShipUI components require Tailwind CSS v4 or later. Please upgrade.\n'))
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
    console.log(`\nOr run: ${chalk.bold('npx @voltenworks/shipui login')} after purchasing.`)
  } else {
    console.log(chalk.green(`Installed ${manifest.displayName} (base).`))
    console.log(`Add theme styling: ${chalk.bold(`npx @voltenworks/shipui add ${parsed.componentName} --theme <slug>`)}`)
  }

  // Usage example
  if (manifest.usage) {
    console.log(`\nUsage:`)
    console.log(chalk.dim(manifest.usage))
  }
  console.log()
}

// ---------- Starter install ----------

async function installStarter(
  name: string,
  config: ReturnType<typeof getProjectConfig>,
  options: {
    theme?: string
    provider?: string
    yes?: boolean
    overwrite?: boolean
    dryRun?: boolean
    force?: boolean
    token?: string
  },
) {
  console.log()
  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN, no files will be written\n'))
  }

  // Check for Tailwind v4
  const twStatus = checkTailwind()
  if (twStatus === 'missing') {
    console.log(chalk.yellow('Warning: Tailwind CSS v4 is not installed. ShipUI starters require Tailwind v4 for theme tokens to work.'))
    console.log(chalk.dim('Install it with: npm install tailwindcss @tailwindcss/postcss\n'))
  } else if (twStatus === 'outdated') {
    console.log(chalk.yellow('Warning: ShipUI starters require Tailwind CSS v4 or later. Please upgrade.\n'))
  }

  // Resolve token if theme is specified
  const token = options.theme ? resolveToken(options.theme, options.token) : null

  // Fetch starter
  const themeLabel = options.theme ? ` with ${options.theme} theme` : ''
  const providerLabel = options.provider ? ` (${options.provider})` : ''
  console.log(`Fetching ${name} starter${providerLabel}${themeLabel}...`)

  const manifest = await fetchStarter(
    config.registry,
    name,
    options.theme,
    options.provider,
    token,
  )

  // Derive paths for conflict check
  const prefix = config.paths.components.includes('/')
    ? config.paths.components.split('/').slice(0, -1).join('/') + '/'
    : ''

  // Check for existing files (abort if any exist, unless --force or --overwrite)
  if (!options.overwrite && !options.force) {
    const fsExtra = await import('fs-extra')
    const conflicts: string[] = []

    for (const file of manifest.files) {
      let targetPath: string
      if (file.path.startsWith('components/')) {
        targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
      } else if (file.path.startsWith('lib/')) {
        targetPath = path.join(process.cwd(), config.paths.lib, file.path.slice('lib/'.length))
      } else {
        targetPath = path.join(process.cwd(), prefix + file.path)
      }

      if (fsExtra.default.existsSync(targetPath)) {
        conflicts.push(path.relative(process.cwd(), targetPath))
      }
    }

    if (conflicts.length > 0) {
      console.log(chalk.red(`\nStarter "${name}" would overwrite existing files:`))
      for (const c of conflicts) {
        console.log(`  ${chalk.red('-')} ${c}`)
      }
      console.log(`\nRe-run with ${chalk.bold('--force')} to continue.`)
      process.exit(1)
    }
  }

  // Handle registry dependencies (install prerequisite components)
  if (manifest.registryDependencies.length > 0) {
    for (const dep of manifest.registryDependencies) {
      if (dep === 'utils') {
        const utilPath = await writeUtility(config, {
          overwrite: options.overwrite ?? false,
          dryRun: options.dryRun ?? false,
        })
        if (utilPath) {
          console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), utilPath)}`)
        }
      } else {
        // Install prerequisite component
        console.log(`\nInstalling dependency: ${dep}...`)
        const depManifest = await (await import('../lib/api.js')).fetchComponent(
          config.registry,
          dep,
          options.theme,
          token,
        )

        if (depManifest.registryDependencies.includes('utils')) {
          await writeUtility(config, {
            overwrite: options.overwrite ?? false,
            dryRun: options.dryRun ?? false,
          })
        }

        const depResult = await (await import('../lib/writer.js')).writeComponentFiles(
          depManifest.files,
          config,
          { overwrite: options.overwrite ?? false, dryRun: options.dryRun ?? false },
        )

        for (const f of depResult.written) {
          console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), f)}`)
        }

        // Merge dep CSS if theme present
        if (depManifest.theme) {
          const cssPath = path.join(process.cwd(), config.paths.css)
          await mergeCss(cssPath, dep, depManifest.theme, {
            overwrite: options.overwrite ?? false,
            force: options.force ?? false,
          })
        }
      }
    }
  }

  // Write starter files
  const writeResult = await writeStarterFiles(manifest.files, config, {
    overwrite: options.overwrite ?? false,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
  })

  // Merge CSS if theme is included
  if (manifest.theme) {
    const cssPath = path.join(process.cwd(), config.paths.css)
    const cssResults = await mergeCss(cssPath, name, manifest.theme, {
      overwrite: options.overwrite ?? false,
      force: options.force ?? false,
    })

    for (const r of cssResults) {
      if (r.action === 'appended') {
        writeResult.written.push(`CSS: ${r.message}`)
      } else if (r.action === 'conflict') {
        console.log(`  ${chalk.red('!')} ${r.message}`)
        return
      }
    }
  }

  // Update layout.tsx with theme fonts
  if (manifest.theme?.fonts && manifest.theme.fonts.length > 0) {
    const layoutUpdated = await updateLayoutFonts(config, manifest.theme.fonts, {
      dryRun: options.dryRun ?? false,
    })
    if (layoutUpdated) {
      writeResult.written.push(layoutUpdated + ' (fonts updated)')
    }
  }

  // Print rich summary
  printStarterSummary(manifest, writeResult, options)

  // Auto-install npm deps
  if (manifest.npmDependencies.length > 0 && !options.dryRun) {
    const missing = getMissingDeps(manifest.npmDependencies)
    if (missing.length > 0) {
      const pm = detectPackageManager()
      const shouldInstall = options.yes || await confirmInstallDeps(missing, pm)
      if (shouldInstall) {
        console.log(`Installing dependencies with ${pm}...`)
        installDeps(missing, pm)
        console.log()
      } else {
        console.log(chalk.yellow(`\nSkipped installing: ${missing.join(', ')}`))
      }
    }
  }
}

function printStarterSummary(
  manifest: StarterManifest,
  writeResult: { written: string[]; skipped: string[] },
  options: { theme?: string },
) {
  console.log()
  const fileCount = manifest.files.length
  const themeLabel = manifest.theme ? ` with ${manifest.theme.themeName} styling` : ''
  console.log(chalk.green(`Installed ${manifest.displayName} starter (${fileCount} files)${themeLabel}`))

  if (manifest.provider) {
    console.log(`  Provider: ${manifest.provider.displayName}`)
  }

  console.log()
  console.log('  Files:')
  for (const f of writeResult.written) {
    console.log(`    ${chalk.green('+')} ${f.startsWith('CSS:') ? f : path.relative(process.cwd(), f)}`)
  }
  for (const f of writeResult.skipped) {
    console.log(`    ${chalk.yellow('~')} ${path.relative(process.cwd(), f)} (exists, skipped)`)
  }

  if (manifest.npmDependencies.length > 0) {
    console.log()
    console.log('  Packages to install:')
    console.log(`    ${manifest.npmDependencies.join(', ')}`)
  }

  if (manifest.provider?.env && manifest.provider.env.length > 0) {
    console.log()
    console.log('  Required env vars:')
    for (const env of manifest.provider.env) {
      console.log(`    ${env}`)
    }
  }

  if (manifest.provider?.postInstall && manifest.provider.postInstall.length > 0) {
    console.log()
    console.log('  Next steps:')
    manifest.provider.postInstall.forEach((step, i) => {
      console.log(`    ${i + 1}. ${step}`)
    })
  }

  if (manifest.provider?.notes) {
    console.log()
    console.log(`  Note: ${manifest.provider.notes}`)
  }

  if (manifest.themeAccess === 'unauthorized') {
    console.log()
    console.log(chalk.yellow(`  Premium ${manifest.themeSlug?.toUpperCase()} styling requires a purchase:`))
    console.log(chalk.cyan(`  ${manifest.purchaseUrl ?? ''}`))
    console.log(`  Or run: ${chalk.bold('npx @voltenworks/shipui login')} after purchasing.`)
  }

  console.log()
}
