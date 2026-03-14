#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { addCommand } from './commands/add.js'
import { listCommand } from './commands/list.js'
import { loginCommand } from './commands/login.js'
import { initCommand } from './commands/init.js'
import { infoCommand } from './commands/info.js'
import { doctorCommand } from './commands/doctor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string }

const program = new Command()

program
  .name('shipui')
  .description('Install ShipUI components into your project')
  .version(pkg.version)

program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(loginCommand)
program.addCommand(initCommand)
program.addCommand(infoCommand)
program.addCommand(doctorCommand)

program.parse()
