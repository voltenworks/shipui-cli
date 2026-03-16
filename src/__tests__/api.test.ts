import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the package.json read at module level
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readFileSync: vi.fn((p: string, ...args: unknown[]) => {
      if (String(p).endsWith('package.json') && String(p).includes('shipui-cli')) {
        return JSON.stringify({ version: '0.1.5' })
      }
      return actual.readFileSync(p, ...(args as [BufferEncoding]))
    }),
  }
})

import {
  fetchRegistryIndex,
  fetchComponent,
  fetchStarter,
  fetchBlueprint,
  validateToken,
  checkMinVersion,
} from '../lib/api.js'

describe('API functions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  describe('fetchRegistryIndex', () => {
    it('fetches registry with trailing slash', async () => {
      const mockData = { version: 1, components: [] }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response)

      const result = await fetchRegistryIndex('https://example.com/api/registry')
      expect(result).toEqual(mockData)
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/registry/',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-shipui-cli-version': '0.1.5' }),
        }),
      )
    })

    it('throws on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response)

      await expect(fetchRegistryIndex('https://example.com/api')).rejects.toThrow('500')
    })
  })

  describe('fetchComponent', () => {
    it('fetches component without theme', async () => {
      const manifest = { version: 1, kind: 'component', name: 'button', files: [] }
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(manifest),
      } as Response)

      const result = await fetchComponent('https://example.com/api/registry', 'button')
      expect(result).toEqual(manifest)
    })

    it('includes theme query param', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      await fetchComponent('https://example.com/api/registry', 'button', 'aloha')
      const url = vi.mocked(fetch).mock.calls[0][0] as string
      expect(url).toContain('theme=aloha')
    })

    it('includes auth header when token provided', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      await fetchComponent('https://example.com/api/registry', 'button', 'aloha', 'my-token')
      const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-token')
    })

    it('throws descriptive error on 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response)

      await expect(
        fetchComponent('https://example.com/api/registry', 'nonexistent'),
      ).rejects.toThrow('not found')
    })
  })

  describe('fetchStarter', () => {
    it('includes provider query param', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response)

      await fetchStarter('https://example.com/api/registry', 'auth', 'aloha', 'clerk')
      const url = vi.mocked(fetch).mock.calls[0][0] as string
      expect(url).toContain('provider=clerk')
      expect(url).toContain('theme=aloha')
    })

    it('throws on 400 with error body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid provider' }),
      } as Response)

      await expect(
        fetchStarter('https://example.com/api/registry', 'auth', undefined, 'badprovider'),
      ).rejects.toThrow('Invalid provider')
    })

    it('throws descriptive error on 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response)

      await expect(
        fetchStarter('https://example.com/api/registry', 'nonexistent'),
      ).rejects.toThrow('not found')
    })
  })

  describe('fetchBlueprint', () => {
    it('throws on 403 with purchase URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({
          error: 'Authentication required',
          purchaseUrl: 'https://example.com/buy',
        }),
      } as Response)

      await expect(
        fetchBlueprint('https://example.com/api/registry', 'aloha'),
      ).rejects.toThrow('Purchase at')
    })

    it('throws on 404', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as Response)

      await expect(
        fetchBlueprint('https://example.com/api/registry', 'nonexistent'),
      ).rejects.toThrow('not found')
    })
  })

  describe('validateToken', () => {
    it('returns validation response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true, product: 'theme_aloha', email: 'user@example.com' }),
      } as Response)

      const result = await validateToken('https://example.com/api/registry', 'my-token')
      expect(result.valid).toBe(true)
      expect(result.product).toBe('theme_aloha')
    })

    it('encodes token in URL', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ valid: true }),
      } as Response)

      await validateToken('https://example.com/api/registry', 'token with spaces')
      const url = vi.mocked(fetch).mock.calls[0][0] as string
      expect(url).toContain('token%20with%20spaces')
    })

    it('throws on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response)

      await expect(
        validateToken('https://example.com/api/registry', 'bad-token'),
      ).rejects.toThrow('401')
    })
  })

  describe('checkMinVersion', () => {
    it('does nothing when no minCliVersion', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      checkMinVersion({ version: 1, components: [] })
      expect(spy).not.toHaveBeenCalled()
    })

    it('warns when CLI version is below minimum', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      checkMinVersion({ version: 1, components: [], minCliVersion: '1.0.0' })
      expect(spy).toHaveBeenCalled()
      const output = spy.mock.calls.map((c) => c[0]).join(' ')
      expect(output).toContain('older')
    })

    it('does not warn when CLI version meets minimum', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      checkMinVersion({ version: 1, components: [], minCliVersion: '0.1.0' })
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
