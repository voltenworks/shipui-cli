import { describe, it, expect, vi, beforeEach } from 'vitest'
import os from 'os'

vi.mock('os', () => ({
  default: {
    platform: vi.fn(),
    homedir: vi.fn(() => '/home/user'),
  },
}))

import { getGlobalConfigPath } from '../lib/paths.js'

const mockOs = vi.mocked(os)

describe('getGlobalConfigPath', () => {
  beforeEach(() => {
    delete process.env.XDG_CONFIG_HOME
    delete process.env.APPDATA
  })

  it('returns XDG path on Linux', () => {
    mockOs.platform.mockReturnValue('linux')
    const result = getGlobalConfigPath()
    expect(result).toBe('/home/user/.config/shipui/config.json')
  })

  it('respects XDG_CONFIG_HOME on Linux', () => {
    mockOs.platform.mockReturnValue('linux')
    process.env.XDG_CONFIG_HOME = '/custom/config'
    const result = getGlobalConfigPath()
    expect(result).toBe('/custom/config/shipui/config.json')
  })

  it('returns .config path on macOS', () => {
    mockOs.platform.mockReturnValue('darwin')
    const result = getGlobalConfigPath()
    expect(result).toBe('/home/user/.config/shipui/config.json')
  })

  it('returns APPDATA path on Windows', () => {
    mockOs.platform.mockReturnValue('win32')
    process.env.APPDATA = 'C:\\Users\\user\\AppData\\Roaming'
    const result = getGlobalConfigPath()
    expect(result).toContain('AppData')
    expect(result).toContain('shipui')
    expect(result).toContain('config.json')
  })

  it('falls back to homedir on Windows without APPDATA', () => {
    mockOs.platform.mockReturnValue('win32')
    const result = getGlobalConfigPath()
    expect(result).toContain('AppData')
    expect(result).toContain('Roaming')
    expect(result).toContain('shipui')
  })
})
