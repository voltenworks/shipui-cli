import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock config before importing auth
vi.mock('../lib/config.js', () => ({
  getGlobalConfig: vi.fn(),
}))

import { resolveToken } from '../lib/auth.js'
import { getGlobalConfig } from '../lib/config.js'

const mockGetGlobalConfig = vi.mocked(getGlobalConfig)

describe('resolveToken', () => {
  beforeEach(() => {
    delete process.env.SHIPUI_TOKEN
    mockGetGlobalConfig.mockReturnValue({ tokens: {} })
  })

  it('returns explicit token when provided', () => {
    mockGetGlobalConfig.mockReturnValue({
      tokens: { theme_pro: 'pro-token' },
    })
    expect(resolveToken('aloha', 'explicit-token')).toBe('explicit-token')
  })

  it('returns SHIPUI_TOKEN env var over stored tokens', () => {
    process.env.SHIPUI_TOKEN = 'env-token'
    mockGetGlobalConfig.mockReturnValue({
      tokens: { theme_pro: 'pro-token' },
    })
    expect(resolveToken('aloha')).toBe('env-token')
  })

  it('returns Pro token over bundle and theme-specific', () => {
    mockGetGlobalConfig.mockReturnValue({
      tokens: {
        theme_pro: 'pro-token',
        theme_aloha_bundle: 'bundle-token',
        theme_aloha: 'theme-token',
      },
    })
    expect(resolveToken('aloha')).toBe('pro-token')
  })

  it('returns bundle token over theme-specific', () => {
    mockGetGlobalConfig.mockReturnValue({
      tokens: {
        theme_aloha_bundle: 'bundle-token',
        theme_aloha: 'theme-token',
      },
    })
    expect(resolveToken('aloha')).toBe('bundle-token')
  })

  it('returns theme-specific token as last resort', () => {
    mockGetGlobalConfig.mockReturnValue({
      tokens: { theme_aloha: 'theme-token' },
    })
    expect(resolveToken('aloha')).toBe('theme-token')
  })

  it('returns null when no tokens match', () => {
    mockGetGlobalConfig.mockReturnValue({
      tokens: { theme_retro: 'wrong-theme' },
    })
    expect(resolveToken('aloha')).toBeNull()
  })

  it('returns null when token store is empty', () => {
    expect(resolveToken('aloha')).toBeNull()
  })

  it('explicit token takes priority over everything', () => {
    process.env.SHIPUI_TOKEN = 'env-token'
    mockGetGlobalConfig.mockReturnValue({
      tokens: { theme_pro: 'pro-token' },
    })
    expect(resolveToken('aloha', 'explicit')).toBe('explicit')
  })
})
