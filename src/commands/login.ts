import { Command } from 'commander'
import chalk from 'chalk'
import { getProjectConfig, getGlobalConfig, saveGlobalConfig } from '../lib/config.js'
import { validateToken } from '../lib/api.js'
import { promptToken } from '../lib/prompts.js'

export const loginCommand = new Command('login')
  .description('Authenticate with your ShipUI download token')
  .option('--token <token>', 'Token to save (skips prompt)')
  .action(async (options: { token?: string }) => {
    try {
      const token = options.token ?? await promptToken()

      if (!token) {
        console.log(chalk.yellow('No token provided.'))
        return
      }

      const config = getProjectConfig()
      console.log('Validating token...')

      const result = await validateToken(config.registry, token)

      if (!result.valid || !result.product) {
        console.log(chalk.red('Invalid token. Please check your purchase email for the correct token.'))
        process.exit(1)
      }

      // Save to global config
      const globalConfig = getGlobalConfig()
      globalConfig.tokens[result.product] = token
      saveGlobalConfig(globalConfig)

      console.log()
      console.log(chalk.green(`Authenticated for ${result.product.replace(/_/g, ' ').toUpperCase()}.`))
      if (result.email) {
        console.log(chalk.dim(`Account: ${result.email}`))
      }
      console.log(`\nYou can now install themed components with: ${chalk.bold('npx @voltenworks/shipui add <name> --theme <slug>')}`)
      console.log()

    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })
