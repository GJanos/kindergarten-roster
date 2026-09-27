import loadHighs from 'highs'
import { demoState } from '../src/demo/demoData'
import { defaultWeek } from '../src/core/calendar'
import { solveInputFor } from '../src/state/solveInput'
import { solve, type LpSolver } from '../src/core/solve'
import { fairShares, countFor } from '../src/core/fairness'
import { groupSwitches } from '../src/core/metrics'

const highs = await loadHighs()
const state = demoState('2026-09-27')
state.staff = state.staff.map((s) => (s.displayName === 'Flóra' ? { ...s, active: false } : s))
const input = solveInputFor(state, defaultWeek('2026-09-27'))
const log: string[] = []
const timed: LpSolver = {
  solve: (lp, opts) => {
    const t = performance.now()
    const res = highs.solve(lp, opts)
    log.push(`${res.Status} ${Math.round(performance.now() - t)}ms obj=${(+res.ObjectiveValue).toFixed(3)}`)
    return res
  },
}
const roster = solve(input, timed, { solvedAt: '', appVersion: 'x' })
console.log(log.join('\n'))
const name = (id: string) => input.staff.find((s) => s.id === id)!.displayName
const big = fairShares(input).map((s) => ({ who: name(s.staffId), kind: s.kind, count: countFor(s, roster), share: +(s.num / s.den).toFixed(2) })).filter((r) => Math.abs(r.count - r.share) >= 1)
console.log('gaps >= 1:', JSON.stringify(big))
console.log('switches:', groupSwitches(input, roster).map((s) => `${name(s.staffId)} ${s.fromGroup}->${s.toGroup}`).join(', '))
const mon = roster.assignments.filter((a) => a.date === input.period.days[0] && a.seat?.kind === 'teacher').map((a) => `${a.seat!.group}${a.shift[0]}:${name(a.staffId)}`).sort()
console.log('Monday teacher seats:', mon.join(' '))
