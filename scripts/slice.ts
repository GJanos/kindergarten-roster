import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import loadHighs from 'highs'
import { groupSwitches, turnarounds } from '../src/core/metrics'
import { resolveNames } from '../src/core/names'
import { makeRoster } from '../src/core/pipeline'
import { footnotes } from '../src/export/views'
import { rosterFileName, rosterWorkbook, workbookBytes } from '../src/export/xlsx'
import { sliceInput, type SliceFile } from './slice-input'

// npm run slice [-- path/to/week.json]   (default: data/aug24.json)
const path = process.argv[2] ?? 'data/aug24.json'
const input = sliceInput(JSON.parse(await readFile(path, 'utf8')) as SliceFile)
const highs = await loadHighs()

const started = performance.now()
const result = makeRoster(input, highs, { solvedAt: new Date().toISOString(), appVersion: 'slice' })
const seconds = ((performance.now() - started) / 1000).toFixed(1)

if (!result.ok) {
  console.error('Strict-rule violations — this is a model bug:', result.violations)
  process.exit(1)
}
const { roster } = result

const out = join(dirname(path), rosterFileName(roster))
const workbook = await rosterWorkbook(roster, input.staff, input.absences, {
  footnotes: footnotes(roster, input.staff),
})
await writeFile(out, await workbookBytes(workbook))

console.log(`Solved in ${seconds} s → ${out}`)
console.table(
  input.staff.map((s) => {
    const mine = roster.assignments.filter((a) => a.staffId === s.id)
    return {
      name: s.displayName,
      role: s.role,
      morning: mine.filter((a) => a.shift === 'morning').length,
      afternoon: mine.filter((a) => a.shift === 'afternoon').length,
      reserve: mine.filter((a) => !a.seat).length,
      opens: mine.filter((a) => a.opener).length,
      closes: mine.filter((a) => a.closer).length,
    }
  }),
)
console.log(
  [
    `holes: ${roster.holes.length}`,
    `substitutions: ${roster.assignments.filter((a) => a.substitution).length}`,
    `group switches: ${groupSwitches(input, roster).length}`,
    `turnarounds: ${turnarounds(input, roster).length}`,
  ].join(' · '),
)
for (const w of roster.warnings) {
  const text = `${w.text}${w.action ? ` ${w.action}` : ''}`
  console.log(`${w.severity.padEnd(6)} ${resolveNames(text, input.staff)}`)
}
