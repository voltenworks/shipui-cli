import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

vi.mock('fs')
vi.mock('child_process')

import { detectPackageManager, checkTailwind, getMissingDeps, installDeps } from '../lib/deps.js'
import { execSync } from 'child_process'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)
const mockExecSync = vi.mocked(execSync)

describe('detectPackageManager', () => {
  beforeEach(() => {
    mockExistsSync.mockReturnValue(false)
  })

  it('detects bun from bun.lockb', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('bun.lockb'))
    expect(detectPackageManager()).toBe('bun')
  })

  it('detects bun from bun.lock', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('bun.lock'))
    expect(detectPackageManager()).toBe('bun')
  })

  it('detects pnpm from pnpm-lock.yaml', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('pnpm-lock.yaml'))
    expect(detectPackageManager()).toBe('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    mockExistsSync.mockImplementation((p) => String(p).endsWith('yarn.lock'))
    expect(detectPackageManager()).toBe('yarn')
  })

  it('defaults to npm when no lock file found', () => {
    expect(detectPackageManager()).toBe('npm')
  })

  it('prefers bun over pnpm when both exist', () => {
    mockExistsSync.mockImplementation((p) => {
      const s = String(p)
      return s.endsWith('bun.lockb') || s.endsWith('pnpm-lock.yaml')
    })
    expect(detectPackageManager()).toBe('bun')
  })
})

describe('checkTailwind', () => {
  it('returns "installed" for Tailwind v4', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '4.1.0' }))
    expect(checkTailwind()).toBe('installed')
  })

  it('returns "outdated" for Tailwind v3', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '3.4.1' }))
    expect(checkTailwind()).toBe('outdated')
  })

  it('returns "missing" when not installed', () => {
    mockExistsSync.mockReturnValue(false)
    expect(checkTailwind()).toBe('missing')
  })

  it('returns "missing" when package.json is unreadable', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(checkTailwind()).toBe('missing')
  })

  it('returns "installed" for v5+', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({ version: '5.0.0' }))
    expect(checkTailwind()).toBe('installed')
  })
})

describe('getMissingDeps', () => {
  it('returns all deps when none installed', () => {
    mockExistsSync.mockReturnValue(false)
    expect(getMissingDeps(['clsx', 'tailwind-merge'])).toEqual(['clsx', 'tailwind-merge'])
  })

  it('returns empty when all installed', () => {
    mockExistsSync.mockReturnValue(true)
    expect(getMissingDeps(['clsx', 'tailwind-merge'])).toEqual([])
  })

  it('returns only missing deps', () => {
    mockExistsSync.mockImplementation((p) => String(p).includes('clsx'))
    expect(getMissingDeps(['clsx', 'tailwind-merge'])).toEqual(['tailwind-merge'])
  })

  it('returns empty for empty input', () => {
    expect(getMissingDeps([])).toEqual([])
  })
})

describe('installDeps', () => {
  it('uses npm install', () => {
    installDeps(['clsx', 'tailwind-merge'], 'npm')
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install clsx tailwind-merge',
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })

  it('uses yarn add', () => {
    installDeps(['clsx'], 'yarn')
    expect(mockExecSync).toHaveBeenCalledWith(
      'yarn add clsx',
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })

  it('uses pnpm add', () => {
    installDeps(['clsx'], 'pnpm')
    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm add clsx',
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })

  it('uses bun add', () => {
    installDeps(['clsx'], 'bun')
    expect(mockExecSync).toHaveBeenCalledWith(
      'bun add clsx',
      expect.objectContaining({ stdio: 'inherit' }),
    )
  })
})
