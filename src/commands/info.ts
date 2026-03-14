import { Command } from 'commander'
import chalk from 'chalk'
import { getProjectConfig } from '../lib/config.js'
import { fetchRegistryIndexCached } from '../lib/api.js'

export const infoCommand = new Command('info')
  .description('Show details about a component')
  .argument('<name>', 'Component name (e.g., button, badge, card)')
  .action(async (name: string) => {
    try {
      const config = getProjectConfig()
      const index = await fetchRegistryIndexCached(config.registry)

      const component = index.components.find(
        (c) => c.name === name.toLowerCase()
      )

      if (!component) {
        console.log(chalk.red(`Component "${name}" not found.`))
        console.log(`Run ${chalk.bold('npx @voltenworks/shipui list')} to see available components.`)
        process.exit(1)
      }

      console.log()
      console.log(chalk.bold(component.displayName))
      console.log(chalk.dim(component.category))
      console.log()
      console.log(component.description)
      console.log()

      console.log(chalk.bold('Available themes:'))
      for (const theme of component.themes) {
        const price = theme.free
          ? chalk.green('free')
          : chalk.dim(`$${theme.themePrice}`)
        console.log(`  ${theme.themeSlug.padEnd(14)} ${theme.themeName.padEnd(20)} ${price}`)
      }

      console.log()
      console.log(chalk.bold('Install:'))
      console.log(`  ${chalk.cyan(`npx @voltenworks/shipui add ${name}`)}`)
      if (component.themes.length > 0) {
        console.log(`  ${chalk.cyan(`npx @voltenworks/shipui add ${name} --theme ${component.themes[0].themeSlug}`)}`)
      }
      console.log()

    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })
