#!/usr/bin/env node
// Fails if retired product names appear in any tracked file. The product is
// Capabble; the old names must not come back in code, copy, config or docs.
import { execFileSync } from 'node:child_process'

const RETIRED = ['se' + 'ms', 'bec' + 'ms'] // split so this file doesn't match itself
const pattern = `\\b(${RETIRED.join('|')})|${RETIRED.map((name) => `[._/@:-]${name}`).join('|')}`

let output = ''
try {
  output = execFileSync('git', ['grep', '-n', '-I', '-i', '-E', pattern, '--', '.'], { encoding: 'utf8' })
} catch (error) {
  if (error.status === 1) {
    console.log('no retired product names found')
    process.exit(0)
  }
  throw error
}

console.error('Retired product names found. Use "Capabble" / "capabble" instead:')
console.error(output.trim())
process.exit(1)
