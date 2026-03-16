import promptsLib from 'prompts'

export async function confirmOverwrite(filePath: string): Promise<boolean> {
  const response = await promptsLib({
    type: 'confirm',
    name: 'overwrite',
    message: `${filePath} already exists. Overwrite?`,
    initial: false,
  })
  return response.overwrite === true
}

export async function confirmStarterReplace(starterName: string, conflicts: string[]): Promise<boolean> {
  const response = await promptsLib({
    type: 'confirm',
    name: 'replace',
    message: `The ${starterName} starter will replace ${conflicts.length} existing file${conflicts.length === 1 ? '' : 's'}. Continue?`,
    initial: false,
  })
  return response.replace === true
}

export async function confirmInstallDeps(deps: string[], pm: string): Promise<boolean> {
  const response = await promptsLib({
    type: 'confirm',
    name: 'install',
    message: `Missing dependencies: ${deps.join(', ')}. Install with ${pm}?`,
    initial: true,
  })
  return response.install === true
}

export async function promptToken(): Promise<string> {
  const response = await promptsLib({
    type: 'text',
    name: 'token',
    message: 'Paste your ShipUI download token (from purchase email):',
  })
  return response.token ?? ''
}

/**
 * Prompt the user to select an auth provider.
 * Returns the selected provider name, or null if cancelled.
 */
export async function promptProvider(providers: { name: string; displayName: string }[]): Promise<string | null> {
  if (providers.length === 0) return null
  if (providers.length === 1) {
    const response = await promptsLib({
      type: 'confirm',
      name: 'confirm',
      message: `This starter requires the ${providers[0].displayName} provider. Continue?`,
      initial: true,
    })
    return response.confirm ? providers[0].name : null
  }

  const response = await promptsLib({
    type: 'select',
    name: 'provider',
    message: 'Select an auth provider:',
    choices: providers.map((p) => ({
      title: p.displayName,
      value: p.name,
    })),
  })
  return response.provider ?? null
}

/**
 * Prompt for auth conflict handling in a ShipUI theme project.
 */
export async function promptAuthConflict(): Promise<'wiring' | 'replace' | 'cancel'> {
  const response = await promptsLib({
    type: 'select',
    name: 'action',
    message: 'This project already has auth pages. What would you like to do?',
    choices: [
      { title: 'Keep existing pages, install provider wiring only', value: 'wiring' },
      { title: 'Replace with starter scaffold pages', value: 'replace' },
      { title: 'Cancel', value: 'cancel' },
    ],
  })
  return response.action ?? 'cancel'
}

/**
 * Prompt for theme selection from a list.
 */
export async function promptTheme(themes: { slug: string; name: string; free: boolean }[]): Promise<string | null> {
  if (themes.length === 0) return null
  const response = await promptsLib({
    type: 'select',
    name: 'theme',
    message: 'Choose a theme:',
    choices: themes.map((t) => ({
      title: `${t.name}${t.free ? ' (free)' : ''}`,
      value: t.slug,
    })),
  })
  return response.theme ?? null
}

/**
 * Prompt for features to include in a new project.
 */
export async function promptFeatures(): Promise<string[]> {
  const response = await promptsLib({
    type: 'multiselect',
    name: 'features',
    message: 'Select features to include:',
    choices: [
      { title: 'Authentication (login, signup, forgot-password)', value: 'auth' },
      { title: 'Dashboard (sidebar, topbar, admin layout)', value: 'dashboard' },
    ],
    instructions: false,
    hint: '- Space to select, Enter to confirm',
  })
  return response.features ?? []
}
