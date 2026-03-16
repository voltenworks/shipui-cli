import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs-extra'
import path from 'path'
import promptsLib from 'prompts'
import {
  type ProjectConfig,
  saveProjectConfig,
  detectProjectType,
  detectThemeProject,
} from '../lib/config.js'
import { resolveToken } from '../lib/auth.js'
import {
  fetchRegistryIndexCached,
  fetchBlueprint,
  checkMinVersion,
  type BlueprintManifest,
} from '../lib/api.js'
import { detectPackageManager, getMissingDeps, installDeps } from '../lib/deps.js'
import { promptTheme, promptFeatures, promptProvider } from '../lib/prompts.js'

export const initCommand = new Command('init')
  .description(
    'Initialize a ShipUI project or scaffold a themed site.\n\n' +
    'Examples:\n' +
    '  shipui init                                              # Interactive setup\n' +
    '  shipui init --theme aloha --yes                          # Full themed site, no prompts\n' +
    '  shipui init --theme aloha --features auth --provider clerk --yes\n' +
    '  shipui init --theme aloha --features auth,dashboard --yes',
  )
  .option('--yes', 'Use defaults without prompting')
  .option('--theme <slug>', 'Theme to scaffold (e.g. aloha, folio, retro)')
  .option('--features <items>', 'Comma-separated starters to install (e.g. auth, dashboard)')
  .option('--provider <name>', 'Auth provider for the auth starter (e.g. clerk)')
  .option('--registry <url>', 'Registry URL override (default: production)')
  .option('--token <token>', 'Authentication token')
  .action(async (options: { yes?: boolean; theme?: string; features?: string; provider?: string; registry?: string; token?: string }) => {
    try {
      const projectType = detectProjectType()

      if (projectType === 'empty') {
        // No package.json — new project flow
        await newProjectFlow(options)
      } else if (projectType === 'nextjs') {
        // Existing Next.js project — setup flow
        await existingProjectSetup(options)
      } else {
        console.log(chalk.red('This directory has a package.json but Next.js is not installed.'))
        console.log('ShipUI requires Next.js. Create a Next.js project first:')
        console.log(chalk.dim('  npx create-next-app@latest'))
        process.exit(1)
      }
    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })

// ---------- New project flow ----------

async function newProjectFlow(options: { yes?: boolean; theme?: string; features?: string; provider?: string; registry?: string; token?: string }) {
  console.log()
  console.log(chalk.bold('ShipUI — New Project Setup'))
  console.log()

  const registry = options.registry || process.env.SHIPUI_REGISTRY || 'https://www.voltenworks.com/api/registry'

  // Fetch available themes
  const index = await fetchRegistryIndexCached(registry)
  checkMinVersion(index)

  // Collect theme slugs with pricing info
  const themeMap = new Map<string, { slug: string; name: string; free: boolean }>()
  for (const c of index.components) {
    for (const t of c.themes) {
      if (!themeMap.has(t.themeSlug)) {
        themeMap.set(t.themeSlug, {
          slug: t.themeSlug,
          name: t.themeName,
          free: t.free,
        })
      }
    }
  }
  const themes = [...themeMap.values()]

  // Step 1: Choose theme
  let themeSlug = options.theme
  if (!themeSlug && !options.yes) {
    themeSlug = await promptTheme(themes) ?? undefined
    if (!themeSlug) {
      console.log(chalk.yellow('Cancelled.'))
      process.exit(0)
    }
  }

  if (!themeSlug) {
    console.log(chalk.red('Specify a theme: --theme <slug>'))
    process.exit(1)
  }

  // Step 2: Choose features
  let selectedFeatures: string[] = []
  if (options.features) {
    selectedFeatures = options.features.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (!options.yes) {
    selectedFeatures = await promptFeatures()
  }

  // Step 3: Choose auth provider if auth selected
  let authProvider: string | null = options.provider ?? null
  if (selectedFeatures.includes('auth') && !authProvider) {
    if (options.yes) {
      // Default to Clerk in non-interactive mode
      authProvider = 'clerk'
    } else {
      authProvider = await promptProvider([{ name: 'clerk', displayName: 'Clerk' }])
      if (!authProvider) {
        console.log(chalk.yellow('Auth provider selection cancelled. Skipping auth.'))
        selectedFeatures = selectedFeatures.filter((f) => f !== 'auth')
      }
    }
  }

  // Resolve token for paid themes
  const token = resolveToken(themeSlug, options.token)

  console.log()
  console.log(`Fetching ${themeSlug} blueprint...`)
  const blueprint = await fetchBlueprint(registry, themeSlug, token)

  // Step 4: Create Next.js project first
  console.log()
  console.log('Creating Next.js project...')
  const pm = detectPackageManager()
  const { execSync } = await import('child_process')

  try {
    execSync(`npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*" --use-${pm} --yes`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  } catch {
    console.log(chalk.red('Failed to create Next.js project. Check the error above.'))
    process.exit(1)
  }

  // Step 5: Write blueprint files
  console.log()
  console.log(`Writing ${blueprint.themeName} theme files...`)
  await writeBlueprintFiles(blueprint)

  // Step 6: Install blueprint dependencies (clsx, tailwind-merge, zod, etc.)
  const blueprintDeps = blueprint.npmDependencies ?? []
  if (blueprintDeps.length > 0) {
    const missing = getMissingDeps(blueprintDeps)
    if (missing.length > 0) {
      console.log()
      console.log(`Installing theme dependencies with ${pm}...`)
      installDeps(missing, pm)
    }
  }

  // Step 7: Write shipui.json
  const config: ProjectConfig = {
    $schemaVersion: 2,
    registry,
    theme: themeSlug,
    projectType: 'shipui-theme',
    features: {},
    paths: {
      components: 'src/components',
      lib: 'src/lib',
      css: 'src/app/globals.css',
    },
    importAlias: '@/',
  }

  // Persist base config before installing starters so partial failures leave a valid project
  saveProjectConfig(config)
  console.log(`  ${chalk.green('+')} shipui.json`)

  // Step 8: Install selected features
  for (const feature of selectedFeatures) {
    console.log()
    console.log(`Installing ${feature} starter...`)
    // Import and use the add command's starter installer
    const { installStarterFromInit } = await import('./add.js')
    await installStarterFromInit(feature, config, {
      theme: themeSlug,
      provider: feature === 'auth' ? authProvider ?? undefined : undefined,
      yes: true,
      overwrite: true,
      force: true,
      token: options.token,
    })

    if (config.features) {
      config.features[feature] = {
        included: true,
        ...(feature === 'auth' && authProvider ? { provider: authProvider, providerInstalled: true } : {}),
      }
    }
  }

  // Re-save with updated features
  saveProjectConfig(config)

  // Step 9: Install dependencies
  const allDeps: string[] = []
  if (selectedFeatures.includes('auth')) {
    allDeps.push('zod')
    if (authProvider === 'clerk') allDeps.push('@clerk/nextjs')
  }
  if (allDeps.length > 0) {
    const missing = getMissingDeps(allDeps)
    if (missing.length > 0) {
      console.log()
      console.log(`Installing dependencies with ${pm}...`)
      installDeps(missing, pm)
    }
  }

  // Step 9: Print next steps
  console.log()
  console.log(chalk.green('Project created successfully!'))
  console.log()
  console.log('Next steps:')
  console.log(`  1. ${chalk.bold(`${pm === 'npm' ? 'npm run' : pm} dev`)}`)

  if (authProvider === 'clerk') {
    console.log('  2. Add your Clerk keys to .env.local:')
    console.log('     NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...')
    console.log('     CLERK_SECRET_KEY=...')
    console.log(`     Get keys at ${chalk.cyan('https://dashboard.clerk.com')}`)
  }

  console.log()
  console.log(chalk.dim(`  ShipUI Themes: ${chalk.cyan('https://www.voltenworks.com/shipui/')}`))
  console.log()
}

// ---------- Existing project setup ----------

async function existingProjectSetup(options: { yes?: boolean; theme?: string; features?: string; provider?: string; registry?: string; token?: string }) {
  const configPath = path.join(process.cwd(), 'shipui.json')

  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow('shipui.json already exists. Use `add` to install components and starters.'))
    return
  }

  console.log()
  console.log(chalk.bold('ShipUI — Project Setup'))
  console.log()

  const registry = options.registry || process.env.SHIPUI_REGISTRY || 'https://www.voltenworks.com/api/registry'

  const config: ProjectConfig = {
    $schemaVersion: 2,
    registry,
    projectType: 'custom',
    paths: {
      components: 'src/components',
      lib: 'src/lib',
      css: 'src/app/globals.css',
    },
    importAlias: '@/',
  }

  if (!options.yes) {
    const responses = await promptsLib([
      {
        type: 'text',
        name: 'components',
        message: 'Components path:',
        initial: fs.existsSync(path.join(process.cwd(), 'components')) ? 'components' : 'src/components',
      },
      {
        type: 'text',
        name: 'lib',
        message: 'Lib path:',
        initial: fs.existsSync(path.join(process.cwd(), 'lib')) ? 'lib' : 'src/lib',
      },
      {
        type: 'text',
        name: 'css',
        message: 'CSS path:',
        initial: fs.existsSync(path.join(process.cwd(), 'app/globals.css')) ? 'app/globals.css' : 'src/app/globals.css',
      },
      {
        type: 'text',
        name: 'importAlias',
        message: 'Import alias:',
        initial: '@/',
      },
      {
        type: 'text',
        name: 'theme',
        message: 'Default theme (optional, e.g. folio, retro):',
        initial: options.theme ?? '',
      },
    ])

    config.paths = {
      components: responses.components ?? config.paths.components,
      lib: responses.lib ?? config.paths.lib,
      css: responses.css ?? config.paths.css,
    }
    config.importAlias = responses.importAlias ?? config.importAlias
    if (responses.theme) {
      config.theme = responses.theme
    }
  } else if (options.theme) {
    config.theme = options.theme
  }

  // Detect if this is a ShipUI theme project
  const detectedTheme = detectThemeProject(config.paths.css)
  if (detectedTheme) {
    config.projectType = 'shipui-theme'
    if (!config.theme) {
      config.theme = detectedTheme
    }
    console.log(chalk.dim(`Detected ${detectedTheme} theme from globals.css`))
  }

  saveProjectConfig(config)
  console.log(chalk.green('Created shipui.json'))
  console.log(`\nRun ${chalk.bold('npx @voltenworks/shipui add button')} to install your first component.`)
  console.log()
}

// ---------- Blueprint file writer ----------

async function writeBlueprintFiles(blueprint: BlueprintManifest): Promise<void> {
  const srcDir = path.resolve(process.cwd(), 'src')
  for (const file of blueprint.files) {
    // Validate path does not escape src/ directory
    if (path.isAbsolute(file.path) || path.normalize(file.path).startsWith('..')) {
      throw new Error(`Unsafe file path in blueprint: ${file.path}`)
    }
    const targetPath = path.resolve(srcDir, file.path)
    if (path.relative(srcDir, targetPath).startsWith('..')) {
      throw new Error(`File path escapes project directory: ${file.path}`)
    }
    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, file.content, 'utf-8')
    console.log(`  ${chalk.green('+')} src/${file.path}`)
  }
}
