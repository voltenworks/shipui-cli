import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { parseInput } from '../lib/parse.js'
import { getProjectConfig, saveProjectConfig, detectProjectType, updateFeature } from '../lib/config.js'
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
import { confirmOverwrite, confirmStarterReplace, confirmInstallDeps, promptProvider, promptAuthConflict } from '../lib/prompts.js'

export const addCommand = new Command('add')
  .description('Add a ShipUI component or starter to your project')
  .argument('<name>', 'Component or starter name (e.g., button, auth, dashboard)')
  .option('--theme <slug>', 'Apply theme styling (e.g., aloha, retro)')
  .option('--provider <name>', 'Select starter provider (e.g., clerk)')
  .option('-y, --yes', 'Skip all confirmation prompts (non-interactive mode)')
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
      // Project validation (Phase 4c)
      const projectType = detectProjectType()
      if (projectType === 'empty') {
        console.log(chalk.red('No package.json found. Run `npx @voltenworks/shipui init` to set up a project first.'))
        process.exit(1)
      }
      if (projectType === 'not-nextjs') {
        console.log(chalk.red('Next.js is not installed. ShipUI requires Next.js.'))
        console.log(`Run ${chalk.bold('npx @voltenworks/shipui init')} to create a new project.`)
        process.exit(1)
      }

      const config = getProjectConfig()

      // Create shipui.json if missing
      if (!fs.existsSync(path.join(process.cwd(), 'shipui.json'))) {
        saveProjectConfig(config)
        console.log(chalk.dim('Created shipui.json\n'))
      }

      // Apply default theme from shipui.json if --theme not specified
      if (!options.theme && config.theme) {
        options.theme = config.theme
      }

      // Auto-detect theme from globals.css markers if still no theme
      if (!options.theme) {
        const detected = detectInstalledTheme(config.paths.css)
        if (detected) {
          options.theme = detected
          console.log(chalk.dim(`Using ${detected} theme (detected from globals.css)\n`))
        }
      }

      // Get registry index
      let knownThemes: string[] | undefined
      let starterNames: string[] = []
      let starterProviders: Record<string, string[]> = {}
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
        for (const s of index.starters ?? []) {
          starterProviders[s.name] = s.providers
        }
      } catch {
        // Proceed without
      }

      // Check if this is a starter
      const isStarter = starterNames.includes(name.toLowerCase())

      if (isStarter) {
        // Provider prompt for starters with providers (Phase 2b)
        const providers = starterProviders[name.toLowerCase()] ?? []
        if (providers.length > 0 && !options.provider) {
          if (options.yes) {
            // Non-interactive mode requires explicit provider for auth
            if (name.toLowerCase() === 'auth') {
              console.log(chalk.red(`Specify a provider: \`add auth --provider clerk --yes\``))
              process.exit(1)
            }
          } else {
            // Prompt for provider
            const selected = await promptProvider(
              providers.map((p) => ({ name: p, displayName: p.charAt(0).toUpperCase() + p.slice(1) })),
            )
            if (!selected) {
              console.log(chalk.yellow('Cancelled.'))
              process.exit(0)
            }
            options.provider = selected
          }
        }

        await installStarter(name.toLowerCase(), config, options)
      } else {
        await installComponent(name, config, options, knownThemes)
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

// ---------- Component install ----------

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
    const fsExtra = await import('fs-extra')
    for (const file of manifest.files) {
      let targetPath: string
      if (file.path.startsWith('components/')) {
        targetPath = path.join(process.cwd(), config.paths.components, file.path.slice('components/'.length))
      } else {
        targetPath = path.join(process.cwd(), config.paths.components, file.path)
      }
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
  // Skip for theme projects with unauthorized access — their globals.css already has everything
  const skipCssMerge = manifest.themeAccess === 'unauthorized' && config.projectType === 'shipui-theme'
  if (manifest.theme && !skipCssMerge) {
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

  // Auth conflict handling — different behavior for theme projects (Phase 4c)
  if (name === 'auth' && config.projectType === 'shipui-theme' && !options.force) {
    const hasExistingAuth = fs.existsSync(path.join(process.cwd(), prefix + 'app/login/page.tsx')) ||
                            fs.existsSync(path.join(process.cwd(), prefix + 'app/sign-in/page.tsx'))

    if (hasExistingAuth && !options.yes) {
      const action = await promptAuthConflict()
      if (action === 'cancel') {
        console.log(chalk.yellow('Cancelled.'))
        process.exit(0)
      }
      if (action === 'wiring') {
        // Install only provider wiring files (middleware, auth.ts), skip page files
        await installAuthWiringOnly(manifest, config, options)
        return
      }
      // 'replace' — continue with normal install
      options.force = true
    }
  }

  // Check for existing files
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
      console.log(chalk.yellow(`\nThe ${name} starter will replace existing files:`))
      for (const c of conflicts) {
        console.log(`  ${chalk.yellow('-')} ${c}`)
      }

      if (name === 'dashboard') {
        console.log(chalk.dim('\n  Note: If this is a dashboard theme, the starter scaffold will replace'))
        console.log(chalk.dim('  the built-in dashboard with a simpler starting point.\n'))
      }

      if (options.yes) {
        // Non-interactive mode: auto-approve (like apt-get -y)
        options.force = true
      } else {
        const confirmed = await confirmStarterReplace(name, conflicts)
        if (!confirmed) {
          console.log(chalk.yellow('Cancelled.'))
          process.exit(0)
        }
        options.force = true
      }
    }
  }

  // Handle registry dependencies (install prerequisite components)
  const depNpmDeps: string[] = []
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
        const depManifest = await fetchComponent(
          config.registry,
          dep,
          options.theme,
          token,
        )

        // Collect npm deps from registry dependencies
        depNpmDeps.push(...depManifest.npmDependencies)

        if (depManifest.registryDependencies.includes('utils')) {
          await writeUtility(config, {
            overwrite: options.overwrite ?? false,
            dryRun: options.dryRun ?? false,
          })
        }

        const depResult = await writeComponentFiles(
          depManifest.files,
          config,
          { overwrite: options.overwrite ?? false, dryRun: options.dryRun ?? false },
        )

        for (const f of depResult.written) {
          console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), f)}`)
        }

        // Merge dep CSS if theme present (skip for theme projects with unauthorized access)
        const skipDepCss = depManifest.themeAccess === 'unauthorized' && config.projectType === 'shipui-theme'
        if (depManifest.theme && !skipDepCss) {
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

  // Merge starter CSS — scaffold pages need .auth-* / .dash-* class definitions
  // and :root defaults for --auth-* / --dash-* variables. These don't conflict with
  // theme styles because themes use their own class names, not --auth-* variables.
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

  // Create .env.example if provider has env vars
  if (manifest.provider?.env && manifest.provider.env.length > 0 && !options.dryRun) {
    const envExamplePath = path.join(process.cwd(), '.env.example')
    const fsExtra = await import('fs-extra')
    const envLines = manifest.provider.env.map((e) =>
      e.includes('=') ? e : `${e}=`
    ).join('\n') + '\n'

    if (!fsExtra.default.existsSync(envExamplePath)) {
      await fsExtra.default.writeFile(envExamplePath, envLines, 'utf-8')
      writeResult.written.push('.env.example')
    } else {
      // Append any missing vars (check by exact key name)
      const existing = await fsExtra.default.readFile(envExamplePath, 'utf-8')
      const existingKeys = new Set(
        existing.split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => line.split('=')[0]),
      )
      const missing = manifest.provider.env.filter((e) => {
        const key = e.split('=')[0]
        return !existingKeys.has(key)
      })
      if (missing.length > 0) {
        const missingLines = missing.map((e) => e.includes('=') ? e : `${e}=`).join('\n') + '\n'
        await fsExtra.default.appendFile(envExamplePath, missingLines)
        writeResult.written.push('.env.example')
      }
    }
  }

  // Print rich summary
  printStarterSummary(manifest, writeResult, options)

  // Track feature in shipui.json (Phase 3)
  if (!options.dryRun) {
    updateFeature(name, {
      included: true,
      ...(options.provider ? { provider: options.provider, providerInstalled: true } : {}),
    })
  }

  // Output structured actions for AI agents when in non-interactive mode
  if (options.yes && manifest.provider) {
    printAgentActions(name, manifest, config)
  }

  // Auto-install npm deps (starter + registry dependency deps)
  const allNpmDeps = [...new Set([...manifest.npmDependencies, ...depNpmDeps])]
  if (allNpmDeps.length > 0 && !options.dryRun) {
    const missing = getMissingDeps(allNpmDeps)
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

/**
 * Install only auth provider wiring (middleware, auth.ts) without replacing existing pages.
 * Used when a ShipUI theme project already has custom auth pages.
 */
async function installAuthWiringOnly(
  manifest: StarterManifest,
  config: ReturnType<typeof getProjectConfig>,
  options: {
    theme?: string
    provider?: string
    dryRun?: boolean
    overwrite?: boolean
    force?: boolean
    token?: string
    yes?: boolean
  },
) {
  const prefix = config.paths.components.includes('/')
    ? config.paths.components.split('/').slice(0, -1).join('/') + '/'
    : ''

  // Install wiring files + Clerk pages (non-conflicting routes like /sign-in, /sign-up)
  // Skip files that would overwrite existing theme auth pages (login/, signup/)
  const wiringFiles = manifest.files.filter((f) =>
    f.path === 'middleware.ts' ||
    f.path.startsWith('lib/auth') ||
    f.path.endsWith('.env.example') ||
    f.path.includes('sign-in/') ||
    f.path.includes('sign-up/'),
  )

  console.log()
  console.log('Installing provider wiring only (preserving existing auth pages)...')

  const projectRoot = path.resolve(process.cwd())

  for (const file of wiringFiles) {
    // Validate path does not escape project directory
    if (path.isAbsolute(file.path) || path.normalize(file.path).startsWith('..')) {
      console.log(`  ${chalk.red('!')} Skipping unsafe path: ${file.path}`)
      continue
    }

    let targetPath: string
    if (file.path.startsWith('lib/')) {
      targetPath = path.join(process.cwd(), config.paths.lib, file.path.slice('lib/'.length))
    } else {
      targetPath = path.join(process.cwd(), prefix + file.path)
    }

    if (path.relative(projectRoot, path.resolve(targetPath)).startsWith('..')) {
      console.log(`  ${chalk.red('!')} Skipping path that escapes project: ${file.path}`)
      continue
    }

    if (options.dryRun) {
      console.log(`  ${chalk.dim('~')} ${path.relative(process.cwd(), targetPath)} (dry run)`)
      continue
    }

    // Rewrite import aliases
    let content = file.content
    if (config.importAlias !== '@/') {
      content = content.replace(/@\//g, config.importAlias)
    }

    const fsExtra = await import('fs-extra')
    await fsExtra.default.ensureDir(path.dirname(targetPath))
    await fsExtra.default.writeFile(targetPath, content, 'utf-8')
    console.log(`  ${chalk.green('+')} ${path.relative(process.cwd(), targetPath)}`)
  }

  // Create .env.example if provider has env vars
  if (manifest.provider?.env && manifest.provider.env.length > 0 && !options.dryRun) {
    const envExamplePath = path.join(process.cwd(), '.env.example')
    const fsExtra = await import('fs-extra')
    // Env entries can be "KEY" (no default) or "KEY=value" (with default)
    const envLines = manifest.provider.env.map((e) =>
      e.includes('=') ? e : `${e}=`
    ).join('\n') + '\n'

    if (!fsExtra.default.existsSync(envExamplePath)) {
      await fsExtra.default.writeFile(envExamplePath, envLines, 'utf-8')
      console.log(`  ${chalk.green('+')} .env.example`)
    } else {
      // Append any missing vars (check by exact key name)
      const existing = await fsExtra.default.readFile(envExamplePath, 'utf-8')
      const existingKeys = new Set(
        existing.split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => line.split('=')[0]),
      )
      const missing = manifest.provider.env.filter((e) => {
        const key = e.split('=')[0]
        return !existingKeys.has(key)
      })
      if (missing.length > 0) {
        const missingLines = missing.map((e) => e.includes('=') ? e : `${e}=`).join('\n') + '\n'
        await fsExtra.default.appendFile(envExamplePath, missingLines)
        console.log(`  ${chalk.green('+')} .env.example (updated)`)
      }
    }
  }

  // Track feature
  if (!options.dryRun) {
    updateFeature('auth', {
      included: true,
      ...(options.provider ? { provider: options.provider, providerInstalled: true } : {}),
    })
  }

  // Print next steps
  if (manifest.provider) {
    console.log()
    console.log(chalk.bold('Next steps:'))
    console.log()
    console.log(`  ${chalk.cyan('1.')} Copy .env.example to .env.local and add your Clerk keys:`)
    console.log(chalk.dim('     cp .env.example .env.local'))
    console.log()
    console.log(`  ${chalk.cyan('2.')} Wrap your root layout with ClerkProvider:`)
    console.log()
    console.log(chalk.dim('     // app/layout.tsx'))
    console.log(chalk.dim('     import { ClerkProvider } from \'@clerk/nextjs\''))
    console.log()
    console.log(chalk.dim('     export default function RootLayout({ children }) {'))
    console.log(chalk.dim('       return ('))
    console.log(chalk.dim('         <ClerkProvider>'))
    console.log(chalk.dim('           <html lang="en">'))
    console.log(chalk.dim('             <body>{children}</body>'))
    console.log(chalk.dim('           </html>'))
    console.log(chalk.dim('         </ClerkProvider>'))
    console.log(chalk.dim('       )'))
    console.log(chalk.dim('     }'))
    console.log()
    console.log(`  ${chalk.cyan('3.')} Update nav links: point "Sign in" to /sign-in and "Sign up" to /sign-up`)
    console.log()
    console.log('  Your existing login/signup pages are preserved at their current routes.')
    if (manifest.provider.notes) {
      console.log(`\n  ${manifest.provider.notes}`)
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
      }
    }
  }

  // Output structured actions for AI agents when in non-interactive mode
  if (options.yes && manifest.provider) {
    printAgentActions('auth', manifest, config)
  }

  console.log()
}

function printStarterSummary(
  manifest: StarterManifest,
  writeResult: { written: string[]; skipped: string[] },
  _options: { theme?: string },
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
    // Split into keys needing user input vs preconfigured defaults
    const needsInput = manifest.provider.env.filter((e) => !e.includes('='))
    const hasDefaults = manifest.provider.env.filter((e) => e.includes('='))

    if (needsInput.length > 0) {
      console.log()
      console.log('  Required env vars (add to .env.local):')
      for (const env of needsInput) {
        console.log(`    ${env}=your_key_here`)
      }
    }
    if (hasDefaults.length > 0) {
      console.log()
      console.log('  Preconfigured in .env.example (no changes needed):')
      for (const env of hasDefaults) {
        console.log(chalk.dim(`    ${env}`))
      }
    }
  }

  if (manifest.provider?.postInstall && manifest.provider.postInstall.length > 0) {
    console.log()
    console.log('  Next steps:')
    console.log(`    1. Copy .env.example to .env.local and add your Clerk keys:`)
    console.log(chalk.dim('       cp .env.example .env.local'))
    console.log()
    console.log(`    2. Wrap your root layout with ClerkProvider:`)
    console.log(chalk.dim('       import { ClerkProvider } from \'@clerk/nextjs\''))
    console.log(chalk.dim('       // Wrap <html>...</html> with <ClerkProvider>'))
    console.log()
    console.log(`    3. Visit /sign-in to test authentication`)
  }

  if (manifest.provider?.notes) {
    console.log()
    console.log(`  ${manifest.provider.notes}`)
  }

  if (manifest.themeAccess === 'unauthorized') {
    console.log()
    console.log(chalk.yellow(`  Premium ${manifest.themeSlug?.toUpperCase()} styling requires a purchase:`))
    console.log(chalk.cyan(`  ${manifest.purchaseUrl ?? ''}`))
    console.log(`  Or run: ${chalk.bold('npx @voltenworks/shipui login')} after purchasing.`)
  }

  console.log()
}

/**
 * Exported for use by init command. Installs a starter with pre-resolved options.
 */
export async function installStarterFromInit(
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
): Promise<void> {
  await installStarter(name, config, {
    ...options,
    dryRun: options.dryRun ?? false,
  })
}

/**
 * Print structured action block for AI agents.
 * Output as a clearly-marked JSON block that agents can parse and act on.
 * Code changes the agent should make, vs things the human needs to do.
 */
function printAgentActions(
  starterName: string,
  manifest: StarterManifest,
  config: ReturnType<typeof getProjectConfig>,
) {
  const prefix = config.paths.components.includes('/')
    ? config.paths.components.split('/').slice(0, -1).join('/') + '/'
    : ''

  const layoutPath = prefix + 'app/layout.tsx'

  const agentTasks: Record<string, unknown>[] = []
  const userTasks: Record<string, unknown>[] = []

  // Agent should modify layout.tsx to add ClerkProvider
  if (manifest.provider?.name === 'clerk' || manifest.provider?.displayName === 'Clerk') {
    agentTasks.push({
      action: 'edit_file',
      file: layoutPath,
      description: 'Add ClerkProvider wrapper to root layout',
      steps: [
        'Add import: import { ClerkProvider } from \'@clerk/nextjs\'',
        'Wrap the <html>...</html> JSX with <ClerkProvider>...</ClerkProvider>',
      ],
    })
  }

  // User needs to add env vars
  const envVarsNeeded = manifest.provider?.env?.filter((e) => !e.includes('=')) ?? []
  if (envVarsNeeded.length > 0) {
    userTasks.push({
      action: 'add_env_vars',
      file: '.env.local',
      description: 'Add authentication API keys',
      vars: envVarsNeeded,
      hint: manifest.provider?.notes ?? null,
    })
  }

  // Agent should copy .env.example to .env.local if it doesn't exist
  agentTasks.push({
    action: 'copy_file',
    from: '.env.example',
    to: '.env.local',
    description: 'Copy env template (if .env.local does not exist)',
    condition: 'only_if_missing',
  })

  const actions = {
    _comment: 'ShipUI post-install actions. Agent: complete agentTasks automatically. User: relay userTasks to the human.',
    starter: starterName,
    provider: manifest.provider?.name ?? null,
    agentTasks,
    userTasks,
  }

  console.log()
  console.log('<!-- SHIPUI_AGENT_ACTIONS')
  console.log(JSON.stringify(actions, null, 2))
  console.log('SHIPUI_AGENT_ACTIONS -->')
}

/**
 * Detect an installed ShipUI theme from globals.css markers.
 * Looks for `/* shipui:theme:<slug>:start *\/` written by the CSS merger.
 */
function detectInstalledTheme(cssPath: string): string | null {
  const fullPath = path.join(process.cwd(), cssPath)
  try {
    const css = fs.readFileSync(fullPath, 'utf-8')
    const match = css.match(/\/\* shipui:theme:([\w-]+):start \*\//)
    return match ? match[1] : null
  } catch {
    return null
  }
}
