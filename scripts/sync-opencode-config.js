#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { buildEocConfig } = require('../src/shared/opencode-config.js')

const ROOT = process.cwd()
const config = buildEocConfig('.', path.join(ROOT, 'commands'))
const outPath = path.join(ROOT, 'opencode.json')
fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
console.log(`[sync-opencode-config] wrote ${outPath}`)
