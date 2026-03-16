import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs-extra', () => ({
  default: {
    existsSync: vi.fn(),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    pathExists: vi.fn(),
  },
}))

import fs from 'fs-extra'
import type { RegistryFile } from '../lib/api.js'
import type { ProjectConfig } from '../lib/config.js'
import { writeComponentFiles, writeStarterFiles, writeUtility, updateLayoutFonts } from '../lib/writer.js'

const mockFs = vi.mocked(fs)

function makeConfig(overrides?: Partial<ProjectConfig>): ProjectConfig {
  return {
    $schemaVersion: 2,
    registry: 'https://www.voltenworks.com/api/registry',
    paths: {
      components: 'src/components',
      lib: 'src/lib',
      css: 'src/app/globals.css',
    },
    importAlias: '@/',
    ...overrides,
  }
}

function makeFile(overrides?: Partial<RegistryFile>): RegistryFile {
  return {
    path: 'components/ui/Button.tsx',
    content: 'import { cn } from "@/lib/utils"\nexport function Button() {}',
    hash: 'abc123',
    ...overrides,
  }
}

describe('writeComponentFiles', () => {
  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.ensureDir.mockResolvedValue(undefined as never)
    mockFs.writeFile.mockResolvedValue(undefined as never)
  })

  it('maps components/ prefix to config.paths.components', async () => {
    const result = await writeComponentFiles([makeFile()], makeConfig(), {
      overwrite: false,
      dryRun: false,
    })

    expect(result.written).toHaveLength(1)
    expect(result.written[0]).toContain('src/components/ui/Button.tsx')
  })

  it('maps lib/ prefix to config.paths.lib', async () => {
    const file = makeFile({
      path: 'lib/utils.ts',
      content: 'export function cn() {}',
    })

    const result = await writeComponentFiles([file], makeConfig(), {
      overwrite: false,
      dryRun: false,
    })

    expect(result.written[0]).toContain('src/lib/utils.ts')
  })

  it('rewrites import alias when different from @/', async () => {
    const config = makeConfig({ importAlias: '~/' })

    await writeComponentFiles([makeFile()], config, {
      overwrite: false,
      dryRun: false,
    })

    const writtenContent = mockFs.writeFile.mock.calls[0][1] as string
    expect(writtenContent).toContain('~/lib/utils')
    expect(writtenContent).not.toContain('@/lib/utils')
  })

  it('does not rewrite when alias is @/', async () => {
    await writeComponentFiles([makeFile()], makeConfig(), {
      overwrite: false,
      dryRun: false,
    })

    const writtenContent = mockFs.writeFile.mock.calls[0][1] as string
    expect(writtenContent).toContain('@/lib/utils')
  })

  it('skips existing files when overwrite is false', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const result = await writeComponentFiles([makeFile()], makeConfig(), {
      overwrite: false,
      dryRun: false,
    })

    expect(result.skipped).toHaveLength(1)
    expect(result.written).toHaveLength(0)
  })

  it('overwrites existing files when overwrite is true', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const result = await writeComponentFiles([makeFile()], makeConfig(), {
      overwrite: true,
      dryRun: false,
    })

    expect(result.written).toHaveLength(1)
    expect(result.skipped).toHaveLength(0)
  })

  it('dry run does not write files', async () => {
    const result = await writeComponentFiles([makeFile()], makeConfig(), {
      overwrite: false,
      dryRun: true,
    })

    expect(result.written).toHaveLength(1)
    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })

  it('falls back to components dir for unknown prefixes', async () => {
    const file = makeFile({ path: 'types/index.ts', content: 'export type Foo = string' })

    const result = await writeComponentFiles([file], makeConfig(), {
      overwrite: false,
      dryRun: false,
    })

    expect(result.written[0]).toContain('src/components/types/index.ts')
  })
})

describe('writeStarterFiles', () => {
  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.ensureDir.mockResolvedValue(undefined as never)
    mockFs.writeFile.mockResolvedValue(undefined as never)
  })

  it('maps app/ files using derived prefix', async () => {
    const file = makeFile({
      path: 'app/login/page.tsx',
      content: 'export default function LoginPage() {}',
    })

    const result = await writeStarterFiles([file], makeConfig(), {
      overwrite: false,
      dryRun: false,
      force: false,
    })

    expect(result.written[0]).toContain('src/app/login/page.tsx')
  })

  it('maps hooks/ files using derived prefix', async () => {
    const file = makeFile({
      path: 'hooks/useLoginForm.ts',
      content: 'export function useLoginForm() {}',
    })

    const result = await writeStarterFiles([file], makeConfig(), {
      overwrite: false,
      dryRun: false,
      force: false,
    })

    expect(result.written[0]).toContain('src/hooks/useLoginForm.ts')
  })

  it('handles root-level components path (no prefix)', async () => {
    const config = makeConfig({ paths: { components: 'components', lib: 'lib', css: 'app/globals.css' } })
    const file = makeFile({
      path: 'app/login/page.tsx',
      content: 'export default function LoginPage() {}',
    })

    const result = await writeStarterFiles([file], config, {
      overwrite: false,
      dryRun: false,
      force: false,
    })

    // No prefix, so app/login/page.tsx directly
    expect(result.written[0]).toContain('app/login/page.tsx')
    expect(result.written[0]).not.toContain('src/')
  })

  it('rewrites import alias in starter files', async () => {
    const config = makeConfig({ importAlias: '~/' })
    const file = makeFile({
      path: 'hooks/useLoginForm.ts',
      content: 'import { validate } from "@/lib/validation/auth"',
    })

    await writeStarterFiles([file], config, {
      overwrite: false,
      dryRun: false,
      force: false,
    })

    const writtenContent = mockFs.writeFile.mock.calls[0][1] as string
    expect(writtenContent).toContain('~/lib/validation/auth')
  })

  it('force flag overrides existing files', async () => {
    mockFs.existsSync.mockReturnValue(true)
    const file = makeFile({ path: 'app/login/page.tsx', content: 'new content' })

    const result = await writeStarterFiles([file], makeConfig(), {
      overwrite: false,
      dryRun: false,
      force: true,
    })

    expect(result.written).toHaveLength(1)
    expect(result.skipped).toHaveLength(0)
  })
})

describe('writeUtility', () => {
  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.ensureDir.mockResolvedValue(undefined as never)
    mockFs.writeFile.mockResolvedValue(undefined as never)
  })

  it('writes cn() utility file', async () => {
    const result = await writeUtility(makeConfig(), { overwrite: false, dryRun: false })
    expect(result).toContain('src/lib/utils.ts')

    const content = mockFs.writeFile.mock.calls[0][1] as string
    expect(content).toContain('clsx')
    expect(content).toContain('twMerge')
    expect(content).toContain('export function cn')
  })

  it('skips if utils.ts already exists', async () => {
    mockFs.existsSync.mockReturnValue(true)
    const result = await writeUtility(makeConfig(), { overwrite: false, dryRun: false })
    expect(result).toBeNull()
  })

  it('overwrites when flag is set', async () => {
    mockFs.existsSync.mockReturnValue(true)
    const result = await writeUtility(makeConfig(), { overwrite: true, dryRun: false })
    expect(result).toContain('utils.ts')
  })

  it('dry run returns path without writing', async () => {
    const result = await writeUtility(makeConfig(), { overwrite: false, dryRun: true })
    expect(result).toContain('utils.ts')
    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })
})

describe('updateLayoutFonts', () => {
  const fonts = [
    { import: 'Pacifico', name: 'Pacifico', variable: '--font-pacifico', weight: ['400'], style: ['normal'] },
    { import: 'Nunito', name: 'Nunito', variable: '--font-nunito', weight: ['400', '600', '700'], style: ['normal'] },
  ]

  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFile.mockResolvedValue('' as never)
    mockFs.writeFile.mockResolvedValue(undefined as never)
  })

  it('returns null for empty fonts array', async () => {
    const result = await updateLayoutFonts(makeConfig(), [], { dryRun: false })
    expect(result).toBeNull()
  })

  it('returns null when layout.tsx does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false)
    const result = await updateLayoutFonts(makeConfig(), fonts, { dryRun: false })
    expect(result).toBeNull()
  })

  it('returns null when fonts are already present', async () => {
    mockFs.readFile.mockResolvedValue(
      'import { Pacifico } from "next/font/google"\nconst pacifico = Pacifico({ weight: "400", subsets: ["latin"], variable: "--font-pacifico" })' as never,
    )
    const result = await updateLayoutFonts(makeConfig(), fonts, { dryRun: false })
    expect(result).toBeNull()
  })

  it('injects font imports into layout with existing imports', async () => {
    const layout = `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ weight: ['400'], subsets: ['latin'], variable: '--font-inter' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={\`\${inter.variable}\`}>
        {children}
      </body>
    </html>
  )
}`
    mockFs.readFile.mockResolvedValue(layout as never)

    await updateLayoutFonts(makeConfig(), fonts, { dryRun: false })

    const written = mockFs.writeFile.mock.calls[0][1] as string
    expect(written).toContain("import { Pacifico, Nunito } from 'next/font/google'")
    expect(written).toContain('--font-pacifico')
    expect(written).toContain('--font-nunito')
    expect(written).toContain('${pacifico.variable} ${nunito.variable}')
  })

  it('adds font import when no existing font import', async () => {
    const layout = `import type { Metadata } from 'next'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}`
    mockFs.readFile.mockResolvedValue(layout as never)

    await updateLayoutFonts(makeConfig(), fonts, { dryRun: false })

    const written = mockFs.writeFile.mock.calls[0][1] as string
    expect(written).toContain("import { Pacifico, Nunito } from 'next/font/google'")
    expect(written).toContain('className={`${pacifico.variable} ${nunito.variable}`}')
  })

  it('dry run returns path without writing', async () => {
    const result = await updateLayoutFonts(makeConfig(), fonts, { dryRun: true })
    expect(result).toContain('layout.tsx')
    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })
})
