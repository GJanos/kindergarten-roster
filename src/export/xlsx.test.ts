import ExcelJS from 'exceljs'
import loadHighs from 'highs'
import { describe, expect, it } from 'vitest'
import { TEST_META, makeInput } from '../core/fixtures'
import { solve } from '../core/solve'
import { rosterFileName, rosterWorkbook, workbookBytes } from './xlsx'

const highs = await loadHighs()

function cellTexts(sheet: ExcelJS.Worksheet): string {
  const texts: string[] = []
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      const value = cell.value as { richText?: { text: string }[] } | string | null
      texts.push(
        typeof value === 'object' && value?.richText
          ? value.richText.map((r) => r.text).join('')
          : String(value ?? ''),
      )
    }),
  )
  return texts.join('\n')
}

describe('Excel export', () => {
  it('writes a file that opens and names everyone', async () => {
    const input = makeInput({ teachers: 4, nannies: 3, groups: 2, absent: { t4: ['2026-10-26'] } })
    const roster = solve(input, highs, TEST_META)
    const bytes = await workbookBytes(await rosterWorkbook(roster, input.staff, input.absences))

    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.load(bytes.buffer as ArrayBuffer)
    expect(reopened.worksheets.map((s) => s.name)).toEqual(['Csoportok', 'Munkatársak'])
    const text = reopened.worksheets.map(cellTexts).join('\n')
    for (const person of input.staff) expect(text).toContain(person.displayName)
    expect(rosterFileName(roster)).toBe('beosztas-2026-10-26.xlsx')
  })
})
