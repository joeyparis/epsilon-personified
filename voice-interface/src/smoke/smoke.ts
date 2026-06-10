import { REQUIRED_APP_STATES } from '../shared/state.js'
import { STATE_PRESENTATION } from '../shared/presentation.js'

function runStateSmoke() {
  let failed = false

  for (const state of REQUIRED_APP_STATES) {
    const presentation = STATE_PRESENTATION[state]
    if (!presentation?.label || !presentation.message) {
      failed = true
      console.log(`${state}: FAIL`)
      continue
    }

    console.log(`${state}: PASS - ${presentation.label}`)
  }

  if (failed) {
    process.exitCode = 1
    return
  }

  console.log('PASS all required states rendered')
}

if (process.argv.includes('--states')) {
  runStateSmoke()
} else {
  console.log('Usage: npm run smoke -- --states')
}
