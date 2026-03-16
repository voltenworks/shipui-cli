import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ThemeOverlay } from '../lib/api.js'

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}))

import fs from 'fs-extra'
import { mergeCss } from '../lib/css-merger.js'

const mockFs = vi.mocked(fs)

function makeTheme(overrides?: Partial<ThemeOverlay>): ThemeOverlay {
  return {
    themeSlug: 'aloha',
    themeName: 'ALOHA // NEXT',
    themeTokens: ':root { --ui-accent: coral; }',
    componentCss: '.btn-base { color: coral; }',
    mode: 'light',
    ...overrides,
  }
}

describe('mergeCss', () => {
  beforeEach(() => {
    mockFs.pathExists.mockResolvedValue(true as never)
    mockFs.writeFile.mockResolvedValue(undefined as never)
  })

  it('appends theme tokens and component CSS to empty file', async () => {
    mockFs.readFile.mockResolvedValue('' as never)

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: false,
    })

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      action: 'appended',
      message: 'Added ALOHA // NEXT theme tokens',
    })
    expect(results[1]).toEqual({
      action: 'appended',
      message: 'Added button CSS rules',
    })

    // Verify written content has markers
    const writtenCss = mockFs.writeFile.mock.calls[0][1] as string
    expect(writtenCss).toContain('/* shipui:theme:aloha:start */')
    expect(writtenCss).toContain('/* shipui:theme:aloha:end */')
    expect(writtenCss).toContain(':root { --ui-accent: coral; }')
    expect(writtenCss).toContain('/* shipui:component:aloha-button:start */')
    expect(writtenCss).toContain('/* shipui:component:aloha-button:end */')
    expect(writtenCss).toContain('.btn-base { color: coral; }')
  })

  it('skips theme tokens if already present', async () => {
    mockFs.readFile.mockResolvedValue(
      '/* shipui:theme:aloha:start */\n:root { --ui-accent: coral; }\n/* shipui:theme:aloha:end */\n' as never,
    )

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: false,
    })

    expect(results[0]).toEqual({
      action: 'skipped',
      message: 'ALOHA // NEXT theme tokens already installed',
    })
    expect(results[1]).toEqual({
      action: 'appended',
      message: 'Added button CSS rules',
    })
  })

  it('skips component CSS if already present', async () => {
    const existing = [
      '/* shipui:theme:aloha:start */',
      ':root {}',
      '/* shipui:theme:aloha:end */',
      '/* shipui:component:aloha-button:start */',
      '.btn-base {}',
      '/* shipui:component:aloha-button:end */',
    ].join('\n')
    mockFs.readFile.mockResolvedValue(existing as never)

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: false,
    })

    expect(results).toEqual([
      { action: 'skipped', message: 'ALOHA // NEXT theme tokens already installed' },
      { action: 'skipped', message: 'button CSS already installed' },
    ])
  })

  it('replaces component CSS when overwrite is true', async () => {
    const existing = [
      '/* shipui:component:aloha-button:start */',
      '.btn-base { color: old; }',
      '/* shipui:component:aloha-button:end */',
    ].join('\n')
    mockFs.readFile.mockResolvedValue(existing as never)

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: true,
      force: false,
    })

    // Should append theme tokens (not present) and replace component CSS
    expect(results).toHaveLength(2)
    expect(results[1]).toEqual({
      action: 'appended',
      message: 'Replaced button CSS rules',
    })

    const writtenCss = mockFs.writeFile.mock.calls[0][1] as string
    expect(writtenCss).toContain('.btn-base { color: coral; }')
    expect(writtenCss).not.toContain('.btn-base { color: old; }')
  })

  it('detects theme conflict and returns conflict result', async () => {
    mockFs.readFile.mockResolvedValue(
      '/* shipui:theme:retro:start */\n:root {}\n/* shipui:theme:retro:end */\n' as never,
    )

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: false,
    })

    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('conflict')
    expect(results[0].message).toContain('retro')
    expect(results[0].message).toContain('--force')
  })

  it('allows theme override with --force', async () => {
    mockFs.readFile.mockResolvedValue(
      '/* shipui:theme:retro:start */\n:root {}\n/* shipui:theme:retro:end */\n' as never,
    )

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: true,
    })

    // Should proceed without conflict
    expect(results.some((r) => r.action === 'conflict')).toBe(false)
    expect(results.some((r) => r.action === 'appended')).toBe(true)
  })

  it('creates file if it does not exist', async () => {
    mockFs.pathExists.mockResolvedValue(false as never)

    const results = await mergeCss('/app/globals.css', 'button', makeTheme(), {
      overwrite: false,
      force: false,
    })

    expect(results).toHaveLength(2)
    expect(results[0].action).toBe('appended')
    expect(results[1].action).toBe('appended')
  })

  it('handles empty themeTokens gracefully', async () => {
    mockFs.readFile.mockResolvedValue('' as never)

    const results = await mergeCss(
      '/app/globals.css',
      'button',
      makeTheme({ themeTokens: '' }),
      { overwrite: false, force: false },
    )

    // Empty themeTokens is falsy, should not append theme block
    expect(results.some((r) => r.message.includes('theme tokens'))).toBe(false)
    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('appended')
  })

  it('handles empty componentCss gracefully', async () => {
    mockFs.readFile.mockResolvedValue('' as never)

    const results = await mergeCss(
      '/app/globals.css',
      'button',
      makeTheme({ componentCss: '' }),
      { overwrite: false, force: false },
    )

    // Should add theme tokens but not component CSS
    expect(results).toHaveLength(1)
    expect(results[0].message).toContain('theme tokens')
  })
})
