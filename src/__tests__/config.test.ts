import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    readFileSync: vi.fn(),
    ensureDirSync: vi.fn(),
  },
}))

vi.mock('../lib/paths.js', () => ({
  getGlobalConfigPath: vi.fn(() => '/home/user/.config/shipui/config.json'),
}))

import fs from 'fs-extra'
import { getProjectConfig, detectProjectType, detectThemeProject, getGlobalConfig, saveGlobalConfig } from '../lib/config.js'

const mockFs = vi.mocked(fs)

describe('getProjectConfig', () => {
  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(false)
  })

  it('returns defaults when no shipui.json exists', () => {
    const config = getProjectConfig()
    expect(config.$schemaVersion).toBe(2)
    expect(config.registry).toBe('https://www.voltenworks.com/api/registry')
    expect(config.paths.components).toBe('src/components')
    expect(config.paths.lib).toBe('src/lib')
    expect(config.paths.css).toBe('src/app/globals.css')
    expect(config.importAlias).toBe('@/')
  })

  it('auto-detects root-level components/ directory', () => {
    mockFs.existsSync.mockImplementation((p) => {
      const s = String(p)
      if (s.endsWith('shipui.json')) return false
      if (s.endsWith('components')) return true
      return false
    })

    const config = getProjectConfig()
    expect(config.paths.components).toBe('components')
  })

  it('reads shipui.json when it exists', () => {
    mockFs.existsSync.mockImplementation((p) => String(p).endsWith('shipui.json'))
    mockFs.readJsonSync.mockReturnValue({
      $schemaVersion: 2,
      registry: 'http://localhost:3000/api/registry',
      theme: 'aloha',
      paths: {
        components: 'src/components',
        lib: 'src/lib',
        css: 'src/app/globals.css',
      },
      importAlias: '@/',
    })

    const config = getProjectConfig()
    expect(config.registry).toBe('http://localhost:3000/api/registry')
    expect(config.theme).toBe('aloha')
  })

  it('migrates v1 config to v2', () => {
    mockFs.existsSync.mockImplementation((p) => String(p).endsWith('shipui.json'))
    mockFs.readJsonSync.mockReturnValue({
      registry: 'https://www.voltenworks.com/api/registry',
      paths: {
        components: 'src/components',
        lib: 'src/lib',
        css: 'src/app/globals.css',
      },
      importAlias: '@/',
      // No $schemaVersion — v1
    })

    const config = getProjectConfig()
    expect(config.$schemaVersion).toBe(2)
    expect(config.projectType).toBe('custom')
  })

  it('fills missing paths with defaults', () => {
    mockFs.existsSync.mockImplementation((p) => String(p).endsWith('shipui.json'))
    mockFs.readJsonSync.mockReturnValue({
      $schemaVersion: 2,
      paths: {},
    })

    const config = getProjectConfig()
    expect(config.paths.components).toBe('src/components')
    expect(config.paths.lib).toBe('src/lib')
    expect(config.paths.css).toBe('src/app/globals.css')
  })
})

describe('detectProjectType', () => {
  it('returns "empty" when no package.json', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(detectProjectType()).toBe('empty')
  })

  it('returns "nextjs" when next is in dependencies', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      dependencies: { next: '^15.0.0', react: '^19.0.0' },
    })
    expect(detectProjectType()).toBe('nextjs')
  })

  it('returns "nextjs" when next is in devDependencies', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      devDependencies: { next: '^15.0.0' },
    })
    expect(detectProjectType()).toBe('nextjs')
  })

  it('returns "not-nextjs" when package.json exists without next', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      dependencies: { react: '^19.0.0' },
    })
    expect(detectProjectType()).toBe('not-nextjs')
  })

  it('returns "not-nextjs" when package.json is invalid', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockImplementation(() => {
      throw new Error('Invalid JSON')
    })
    expect(detectProjectType()).toBe('not-nextjs')
  })
})

describe('detectThemeProject', () => {
  it('returns theme slug when CSS has theme marker', () => {
    mockFs.readFileSync.mockReturnValue(
      '/* shipui:theme:aloha:start */\n:root { }\n/* shipui:theme:aloha:end */',
    )
    expect(detectThemeProject('src/app/globals.css')).toBe('aloha')
  })

  it('returns null when no theme marker', () => {
    mockFs.readFileSync.mockReturnValue('@tailwind base;')
    expect(detectThemeProject('src/app/globals.css')).toBeNull()
  })

  it('detects hyphenated theme slugs', () => {
    mockFs.readFileSync.mockReturnValue(
      '/* shipui:theme:solar-dark:start */\n:root { }\n/* shipui:theme:solar-dark:end */',
    )
    expect(detectThemeProject('src/app/globals.css')).toBe('solar-dark')
  })

  it('returns null when file does not exist', () => {
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(detectThemeProject('src/app/globals.css')).toBeNull()
  })
})

describe('getGlobalConfig', () => {
  it('returns empty tokens when config does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(getGlobalConfig()).toEqual({ tokens: {} })
  })

  it('reads existing config', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      tokens: { theme_pro: 'abc123' },
    })
    expect(getGlobalConfig()).toEqual({ tokens: { theme_pro: 'abc123' } })
  })
})

describe('saveGlobalConfig', () => {
  it('creates directory and writes config', () => {
    saveGlobalConfig({ tokens: { theme_aloha: 'token' } })
    expect(mockFs.ensureDirSync).toHaveBeenCalledWith(
      path.dirname('/home/user/.config/shipui/config.json'),
    )
    expect(mockFs.writeJsonSync).toHaveBeenCalledWith(
      '/home/user/.config/shipui/config.json',
      { tokens: { theme_aloha: 'token' } },
      { spaces: 2 },
    )
  })
})
