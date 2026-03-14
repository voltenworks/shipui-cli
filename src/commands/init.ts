import { Command } from 'commander'
import chalk from 'chalk'
import fs from 'fs-extra'
import path from 'path'
import promptsLib from 'prompts'

export const initCommand = new Command('init')
  .description('Initialize ShipUI configuration for your project')
  .option('--yes', 'Use defaults without prompting')
  .action(async (options: { yes?: boolean }) => {
    try {
      const configPath = path.join(process.cwd(), 'shipui.json')

      if (fs.existsSync(configPath)) {
        console.log(chalk.yellow('shipui.json already exists.'))
        return
      }

      const config = {
        $schemaVersion: 1,
        registry: 'https://voltenworks.com/api/registry',
        paths: {
          components: 'src/components',
          lib: 'src/lib',
          css: 'src/app/globals.css',
        },
        importAlias: '@/',
      }

      if (!options.yes) {
        const responses = await promptsLib([
          {
            type: 'text',
            name: 'components',
            message: 'Components path:',
            initial: fs.existsSync(path.join(process.cwd(), 'components')) ? 'components' : 'src/components',
          },
          {
            type: 'text',
            name: 'lib',
            message: 'Lib path:',
            initial: fs.existsSync(path.join(process.cwd(), 'lib')) ? 'lib' : 'src/lib',
          },
          {
            type: 'text',
            name: 'css',
            message: 'CSS path:',
            initial: fs.existsSync(path.join(process.cwd(), 'app/globals.css')) ? 'app/globals.css' : 'src/app/globals.css',
          },
          {
            type: 'text',
            name: 'importAlias',
            message: 'Import alias:',
            initial: '@/',
          },
        ])

        config.paths = {
          components: responses.components ?? config.paths.components,
          lib: responses.lib ?? config.paths.lib,
          css: responses.css ?? config.paths.css,
        }
        config.importAlias = responses.importAlias ?? config.importAlias
      }

      await fs.writeJson(configPath, config, { spaces: 2 })
      console.log(chalk.green('Created shipui.json'))
      console.log(`\nRun ${chalk.bold('npx @voltenworks/shipui add button')} to install your first component.`)
      console.log()

    } catch (error) {
      console.error(chalk.red((error as Error).message))
      process.exit(1)
    }
  })
