import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { getProjectConfig, getGlobalConfig } from '../lib/config.js'
import { getGlobalConfigPath } from '../lib/paths.js'
import { checkTailwind, detectPackageManager } from '../lib/deps.js'
import { fetchRegistryIndex } from '../lib/api.js'

interface Check {
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail?: string
}

export const doctorCommand = new Command('doctor')
  .description('Diagnose your project setup for ShipUI compatibility')
  .action(async () => {
    const checks: Check[] = []
    const config = getProjectConfig()

    // 1. Node version
    const nodeVersion = process.versions.node
    const nodeMajor = parseInt(nodeVersion.split('.')[0], 10)
    checks.push(
      nodeMajor >= 18
        ? { label: 'Node.js', status: 'pass', detail: `v${nodeVersion}` }
        : { label: 'Node.js', status: 'fail', detail: `v${nodeVersion} (requires 18+)` },
    )

    // 2. Package manager
    const pm = detectPackageManager()
    checks.push({ label: 'Package manager', status: 'pass', detail: pm })

    // 3. package.json exists
    const hasPkgJson = fs.existsSync(path.join(process.cwd(), 'package.json'))
    checks.push(
      hasPkgJson
        ? { label: 'package.json', status: 'pass' }
        : { label: 'package.json', status: 'fail', detail: 'Not found. Run this from your project root.' },
    )

    // 4. Tailwind v4
    const tw = checkTailwind()
    if (tw === 'installed') {
      checks.push({ label: 'Tailwind CSS v4', status: 'pass' })
    } else if (tw === 'outdated') {
      checks.push({ label: 'Tailwind CSS', status: 'warn', detail: 'Version < 4. ShipUI theme tokens require v4.' })
    } else {
      checks.push({ label: 'Tailwind CSS v4', status: 'warn', detail: 'Not installed. Theme tokens need Tailwind v4 to resolve.' })
    }

    // 5. PostCSS config
    const postcssFiles = ['postcss.config.js', 'postcss.config.mjs', 'postcss.config.cjs', 'postcss.config.ts']
    const hasPostcss = postcssFiles.some((f) => fs.existsSync(path.join(process.cwd(), f)))
    if (tw === 'installed') {
      checks.push(
        hasPostcss
          ? { label: 'PostCSS config', status: 'pass' }
          : { label: 'PostCSS config', status: 'warn', detail: 'Not found. Tailwind v4 needs @tailwindcss/postcss.' },
      )
    }

    // 6. globals.css exists
    const cssPath = path.join(process.cwd(), config.paths.css)
    checks.push(
      fs.existsSync(cssPath)
        ? { label: 'CSS file', status: 'pass', detail: config.paths.css }
        : { label: 'CSS file', status: 'warn', detail: `${config.paths.css} not found. Theme CSS will be created here.` },
    )

    // 7. Components directory
    const compDir = path.join(process.cwd(), config.paths.components)
    checks.push(
      fs.existsSync(compDir)
        ? { label: 'Components dir', status: 'pass', detail: config.paths.components }
        : { label: 'Components dir', status: 'pass', detail: `${config.paths.components} (will be created on first install)` },
    )

    // 8. shipui.json
    const hasConfig = fs.existsSync(path.join(process.cwd(), 'shipui.json'))
    checks.push({
      label: 'shipui.json',
      status: 'pass',
      detail: hasConfig ? 'Found' : 'Not found (using defaults, this is fine)',
    })

    // 9. Auth tokens
    const globalConfig = getGlobalConfig()
    const tokenCount = Object.keys(globalConfig.tokens).length
    checks.push({
      label: 'Auth tokens',
      status: tokenCount > 0 ? 'pass' : 'warn',
      detail: tokenCount > 0
        ? `${tokenCount} token${tokenCount > 1 ? 's' : ''} stored at ${getGlobalConfigPath()}`
        : 'No tokens. Run npx @voltenworks/shipui login to authenticate.',
    })

    // 10. Registry reachable
    try {
      const index = await fetchRegistryIndex(config.registry)
      const total = index.components.reduce((sum, c) => sum + c.themes.length, 0)
      checks.push({
        label: 'Registry',
        status: 'pass',
        detail: `${index.components.length} components, ${total} entries`,
      })
    } catch (err) {
      checks.push({
        label: 'Registry',
        status: 'fail',
        detail: `Cannot reach ${config.registry}. ${(err as Error).message}`,
      })
    }

    // 11. clsx + tailwind-merge
    const deps = ['clsx', 'tailwind-merge']
    const missingDeps = deps.filter(
      (d) => !fs.existsSync(path.join(process.cwd(), 'node_modules', d, 'package.json')),
    )
    if (missingDeps.length === 0) {
      checks.push({ label: 'Dependencies', status: 'pass', detail: 'clsx, tailwind-merge' })
    } else {
      checks.push({
        label: 'Dependencies',
        status: 'warn',
        detail: `Missing: ${missingDeps.join(', ')}. Will be installed on first component add.`,
      })
    }

    // Print results
    console.log()
    console.log(chalk.bold('ShipUI Doctor'))
    console.log()

    let passes = 0
    let warns = 0
    let fails = 0

    for (const check of checks) {
      const icon =
        check.status === 'pass' ? chalk.green('✓') :
        check.status === 'warn' ? chalk.yellow('!') :
        chalk.red('✗')
      const detail = check.detail ? chalk.dim(` ${check.detail}`) : ''
      console.log(`  ${icon} ${check.label}${detail}`)

      if (check.status === 'pass') passes++
      else if (check.status === 'warn') warns++
      else fails++
    }

    console.log()
    if (fails > 0) {
      console.log(chalk.red(`${fails} issue${fails > 1 ? 's' : ''} found. Fix the errors above before using ShipUI.`))
    } else if (warns > 0) {
      console.log(chalk.yellow(`${warns} warning${warns > 1 ? 's' : ''}. ShipUI will work but some features may not behave as expected.`))
    } else {
      console.log(chalk.green('All checks passed. Your project is ready for ShipUI.'))
    }
    console.log()
  })
