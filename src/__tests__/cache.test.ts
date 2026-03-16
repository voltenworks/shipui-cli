import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    readJsonSync: vi.fn(),
    writeJsonSync: vi.fn(),
    ensureDirSync: vi.fn(),
  },
}))

vi.mock('../lib/paths.js', () => ({
  getGlobalConfigPath: vi.fn(() => '/home/user/.config/shipui/config.json'),
}))

import fs from 'fs-extra'
import { getCachedRegistry, setCachedRegistry } from '../lib/cache.js'
import type { RegistryIndex } from '../lib/api.js'

const mockFs = vi.mocked(fs)

const sampleIndex: RegistryIndex = {
  version: 1,
  components: [
    {
      name: 'button',
      displayName: 'Button',
      category: 'ui',
      description: 'A button',
      tags: ['ui'],
      themes: [{ themeSlug: 'aloha', themeName: 'ALOHA', free: false, themePrice: 29 }],
    },
  ],
}

describe('getCachedRegistry', () => {
  it('returns null when cache file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false)
    expect(getCachedRegistry()).toBeNull()
  })

  it('returns data when cache is fresh', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      timestamp: Date.now() - 1000, // 1 second ago
      data: sampleIndex,
    })
    expect(getCachedRegistry()).toEqual(sampleIndex)
  })

  it('returns null when cache is stale (>24h)', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockReturnValue({
      timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
      data: sampleIndex,
    })
    expect(getCachedRegistry()).toBeNull()
  })

  it('returns null on read error', () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readJsonSync.mockImplementation(() => {
      throw new Error('corrupt')
    })
    expect(getCachedRegistry()).toBeNull()
  })
})

describe('setCachedRegistry', () => {
  it('writes cache entry with timestamp', () => {
    const before = Date.now()
    setCachedRegistry(sampleIndex)

    expect(mockFs.ensureDirSync).toHaveBeenCalled()
    expect(mockFs.writeJsonSync).toHaveBeenCalled()

    const writtenData = mockFs.writeJsonSync.mock.calls[0][1] as { timestamp: number; data: RegistryIndex }
    expect(writtenData.data).toEqual(sampleIndex)
    expect(writtenData.timestamp).toBeGreaterThanOrEqual(before)
    expect(writtenData.timestamp).toBeLessThanOrEqual(Date.now())
  })
})
