#!/usr/bin/env node
const suppressOutput =
  process.env.EOC_SKIP_POSTINSTALL_OUTPUT === 'true' ||
  process.env.EOC_SKIP_INTERACTIVE === 'true' ||
  process.env.npm_config_user_agent?.includes('yarn') === true

if (!suppressOutput) {
  console.log('')
  console.log('Easy OpenCode installed via npm.')
  console.log('Run `eoc-install` in a project for project-level setup.')
  console.log('')
}
