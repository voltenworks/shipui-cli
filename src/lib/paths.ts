import path from 'path'
import os from 'os'

export function getGlobalConfigPath(): string {
  const platform = os.platform()

  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'shipui', 'config.json')
  }

  // macOS and Linux
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  return path.join(configHome, 'shipui', 'config.json')
}
