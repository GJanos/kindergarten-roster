import type { CellRichTextValue, Font, Workbook, Worksheet } from 'exceljs'
import type { Absence, Roster, Staff } from '../core/types'
import { LEGEND, dayHeader, formatPeriod } from '../i18n/hu'
import { groupView, personView, type Line, type Tone } from './views'

export type XlsxExtras = { groupLabels?: string[]; footnotes?: string[]; backupJson?: string }

/** The hidden sheet that makes every exported Excel a backup too. */
export const BACKUP_SHEET = 'adatok'
/** Excel caps a cell at 32,767 characters. */
const CHUNK = 30_000

const FILLS = { morning: 'FFFFF6D5', afternoon: 'FFDCEBFA', absent: 'FFE3E3E3', closed: 'FFF2F2F2' }
const COLORS: Record<Tone, string> = {
  hole: 'FFC00000',
  substitution: 'FFD46A00',
  muted: 'FF808080',
}

export function rosterFileName(roster: Roster): string {
  return `beosztas-${roster.period.start}.xlsx`
}

/** The group view and the person view, printable on A4 landscape, editable in Excel. */
export async function rosterWorkbook(
  roster: Roster,
  staff: Staff[],
  absences: Absence[],
  extras: XlsxExtras = {},
): Promise<Workbook> {
  // Loaded on demand: ExcelJS is most of the bundle and only needed here.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Óvodai beosztás'
  addGroupSheet(workbook, roster, staff, extras)
  addPersonSheet(workbook, roster, staff, absences)
  if (extras.backupJson) addBackupSheet(workbook, extras.backupJson)
  return workbook
}

export async function workbookBytes(workbook: Workbook): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

/** URI-encoded, so no chunk starts or ends with a space Excel might trim. */
function addBackupSheet(workbook: Workbook, json: string): void {
  const sheet = workbook.addWorksheet(BACKUP_SHEET, { state: 'veryHidden' })
  const encoded = encodeURIComponent(json)
  for (let i = 0; i < encoded.length; i += CHUNK) sheet.addRow([encoded.slice(i, i + CHUNK)])
}

export async function backupFromXlsx(data: ArrayBuffer): Promise<string> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(data)
  const sheet = workbook.getWorksheet(BACKUP_SHEET)
  if (!sheet) throw new Error('This Excel file holds no backup')
  const parts: string[] = []
  sheet.eachRow((row) => parts.push(String(row.getCell(1).value ?? '')))
  return decodeURIComponent(parts.join(''))
}

function landscape(workbook: Workbook, name: string): Worksheet {
  return workbook.addWorksheet(name, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  })
}

function font(line: { bold?: boolean; tone?: Tone }): Partial<Font> {
  return {
    ...(line.bold ? { bold: true } : {}),
    ...(line.tone ? { color: { argb: COLORS[line.tone] } } : {}),
  }
}

function richText(lines: Line[]): CellRichTextValue | string {
  if (lines.length === 0) return ''
  return {
    richText: lines.map((line, i) => ({ text: (i > 0 ? '\n' : '') + line.text, font: font(line) })),
  }
}

function addFooter(sheet: Worksheet, footnotes: string[] = []): void {
  sheet.addRow([])
  for (const note of footnotes) sheet.addRow([note])
  for (const line of LEGEND) sheet.addRow([line]).font = { size: 9 }
}

function addGroupSheet(
  workbook: Workbook,
  roster: Roster,
  staff: Staff[],
  extras: XlsxExtras,
): void {
  const view = groupView(roster, staff, extras.groupLabels)
  const sheet = landscape(workbook, 'Csoportok')
  sheet.columns = [{ width: 28 }, ...view.days.map(() => ({ width: 30 }))]
  sheet.addRow([`Beosztás — ${formatPeriod(view.days)}`]).font = { bold: true, size: 14 }
  sheet.addRow(['', ...view.days.map(dayHeader)]).font = { bold: true }
  for (const row of view.rows) {
    const excelRow = sheet.addRow([row.label, ...row.cells.map(richText)])
    excelRow.alignment = { vertical: 'top', wrapText: true }
    excelRow.getCell(1).font = { bold: true }
    excelRow.height = 16 * Math.max(1, ...row.cells.map((cell) => cell.length))
  }
  addFooter(sheet, extras.footnotes)
}

function addPersonSheet(
  workbook: Workbook,
  roster: Roster,
  staff: Staff[],
  absences: Absence[],
): void {
  const view = personView(roster, staff, absences)
  const sheet = landscape(workbook, 'Munkatársak')
  sheet.columns = [{ width: 24 }, ...view.days.map(() => ({ width: 24 }))]
  sheet.addRow([`Beosztás munkatársanként — ${formatPeriod(view.days)}`]).font = {
    bold: true,
    size: 14,
  }
  sheet.addRow(['', ...view.days.map(dayHeader)]).font = { bold: true }
  for (const row of view.rows) {
    const excelRow = sheet.addRow([row.name, ...row.cells.map((cell) => cell.text)])
    row.cells.forEach((cell, i) => {
      const target = excelRow.getCell(i + 2)
      if (cell.fill) {
        target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILLS[cell.fill] } }
      }
      target.font = font(cell)
    })
  }
  addFooter(sheet)
}
