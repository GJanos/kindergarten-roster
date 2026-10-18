import { readFile } from 'node:fs/promises'
import loadHighs from 'highs'
import { STAGES, buildModel } from '../src/core/model'
import { solve, type LpSolver } from '../src/core/solve'
import { validateRoster } from '../src/core/validate'
import { migrate } from '../src/state/migrate'
import { solveInputFor } from '../src/state/solveInput'

// npx tsx scripts/time-weeks.ts data/ovoda-mentes-2026-10-17.json
// Solves every week with a saved roster in a backup: seconds per solver stage, and any break.
const state = migrate(JSON.parse(await readFile(process.argv[2], 'utf8')))
const highs = await loadHighs()
for (const week of Object.keys(state.periods).sort()) {
  if (!state.periods[week].roster) continue
  const input = solveInputFor(state, week)
  const stages = STAGES.filter((stage) => !buildModel(input).objectives[stage].isEmpty())
  const seconds: string[] = []
  const timed: LpSolver = {
    solve: (lp, options) => {
      const started = performance.now()
      const result = highs.solve(lp, options)
      const took = ((performance.now() - started) / 1000).toFixed(1)
      seconds.push(`${stages[seconds.length]} ${took}${result.Status === 'Optimal' ? '' : '!'}`)
      return result
    },
  }
  const roster = solve(input, timed, { solvedAt: new Date().toISOString(), appVersion: 'time' })
  const broken = validateRoster(input, roster).map((v) => v.rule)
  const people = `${input.staff.filter((s) => s.role === 'teacher').length}t/${input.staff.filter((s) => s.role === 'nanny').length}n`
  console.log(
    week,
    people,
    seconds.join(', '),
    roster.stoppedEarly ?? '',
    broken.join(',') || 'valid',
  )
}
