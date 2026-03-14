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
