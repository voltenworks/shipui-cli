import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

export function detectPackageManager(): PackageManager {
  const cwd = process.cwd()

  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun'
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/** Check if Tailwind v4 is installed in the project. */
export function checkTailwind(): 'installed' | 'missing' | 'outdated' {
  const pkgPath = path.join(process.cwd(), 'node_modules', 'tailwindcss', 'package.json')
  if (!fs.existsSync(pkgPath)) return 'missing'
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string }
    const major = parseInt(pkg.version?.split('.')[0] ?? '0', 10)
    return major >= 4 ? 'installed' : 'outdated'
  } catch {
    return 'missing'
  }
}

export function getMissingDeps(deps: string[]): string[] {
  const missing: string[] = []
  for (const dep of deps) {
    try {
      const pkgPath = path.join(process.cwd(), 'node_modules', dep, 'package.json')
      if (!fs.existsSync(pkgPath)) {
        missing.push(dep)
      }
    } catch {
      missing.push(dep)
    }
  }
  return missing
}

export function installDeps(deps: string[], pm: PackageManager): void {
  const installCmd = {
    npm: `npm install ${deps.join(' ')}`,
    yarn: `yarn add ${deps.join(' ')}`,
    pnpm: `pnpm add ${deps.join(' ')}`,
    bun: `bun add ${deps.join(' ')}`,
  }

  execSync(installCmd[pm], { stdio: 'inherit', cwd: process.cwd() })
}
