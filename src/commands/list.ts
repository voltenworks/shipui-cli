import { Command } from 'commander'
import chalk from 'chalk'
import { getProjectConfig } from '../lib/config.js'
import { fetchRegistryIndex } from '../lib/api.js'

export const listCommand = new Command('list')
  .description('List available ShipUI components')
  .option('--theme <slug>', 'Filter by theme')
  .option('--category <category>', 'Filter by category (ui, section)')
  .option('--free', 'Show only free theme components')
  .action(async (options: { theme?: string; category?: string; free?: boolean }) => {
    try {
      const config = getProjectConfig()
      const index = await fetchRegistryIndex(config.registry)

      let components = index.components

      if (options.category) {
        components = components.filter((c) => c.category === options.category)
      }

      if (options.theme) {
        components = components.filter((c) =>
          c.themes.some((t) => t.themeSlug === options.theme),
        )
      }

      if (options.free) {
        components = components.filter((c) =>
          c.themes.some((t) => t.free),
        )
      }

      if (components.length === 0) {
        console.log(chalk.yellow('No components found matching your filters.'))
        return
      }

      console.log()
      console.log(chalk.bold('Available Components'))
      console.log()

      // Table header
      const nameWidth = 20
      const catWidth = 10

      console.log(
        chalk.dim(
          'Name'.padEnd(nameWidth) + 'Type'.padEnd(catWidth) + 'Themes'
        )
      )
      console.log(chalk.dim('-'.repeat(70)))

      for (const comp of components) {
        const themes = comp.themes
          .map((t) => t.free ? chalk.green(t.themeSlug) : t.themeSlug)
          .join(', ')

        console.log(
          chalk.white(comp.displayName.padEnd(nameWidth)) +
          chalk.dim(comp.category.padEnd(catWidth)) +
          themes
        )
      }

      console.log()
      console.log(`Install: ${chalk.bold('npx @voltenworks/shipui add <name>')}`)
      console.log(`With theme: ${chalk.bold('npx @voltenworks/shipui add <name> --theme <slug>')}`)
      console.log()

    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })
