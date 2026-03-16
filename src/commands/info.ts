import { Command } from 'commander'
import chalk from 'chalk'
import { getProjectConfig } from '../lib/config.js'
import { fetchRegistryIndexCached } from '../lib/api.js'

export const infoCommand = new Command('info')
  .description('Show details about a component or starter')
  .argument('<name>', 'Component or starter name (e.g., button, auth, dashboard)')
  .action(async (name: string) => {
    try {
      const config = getProjectConfig()
      const index = await fetchRegistryIndexCached(config.registry)

      // Check starters first
      const starter = (index.starters ?? []).find(
        (s) => s.name === name.toLowerCase()
      )

      if (starter) {
        console.log()
        console.log(chalk.bold(starter.displayName) + chalk.dim(' (starter)'))
        console.log(chalk.dim(starter.category))
        console.log()
        console.log(starter.description)
        console.log()

        if (starter.providers.length > 0) {
          console.log(chalk.bold('Providers:'))
          for (const p of starter.providers) {
            console.log(`  ${p}`)
          }
          console.log()
        }

        console.log(chalk.bold('Install:'))
        console.log(`  ${chalk.cyan(`npx @voltenworks/shipui add ${name}`)}`)
        if (starter.providers.length > 0) {
          console.log(`  ${chalk.cyan(`npx @voltenworks/shipui add ${name} --provider ${starter.providers[0]}`)}`)
        }
        console.log(`  ${chalk.cyan(`npx @voltenworks/shipui add ${name} --theme <slug>`)}`)
        console.log()
        return
      }

      // Check components
      const component = index.components.find(
        (c) => c.name === name.toLowerCase()
      )

      if (!component) {
        console.log(chalk.red(`"${name}" not found.`))
        console.log(`Run ${chalk.bold('npx @voltenworks/shipui list')} to see available components and starters.`)
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
