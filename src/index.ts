#!/usr/bin/env node
import { Command } from 'commander'
import { addCommand } from './commands/add.js'
import { listCommand } from './commands/list.js'
import { loginCommand } from './commands/login.js'
import { initCommand } from './commands/init.js'
import { infoCommand } from './commands/info.js'

const program = new Command()

program
  .name('shipui')
  .description('Install ShipUI components into your project')
  .version('0.1.1')

program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(loginCommand)
program.addCommand(initCommand)
program.addCommand(infoCommand)

program.parse()
