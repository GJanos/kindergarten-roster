import { weekday } from '../core/calendar'
import type { Shift } from '../core/types'

/** Every Hungarian string the app shows lives in this file. */

type DayForms = { name: string; on: string; from: string }

const DAYS: DayForms[] = [
  { name: 'vasárnap', on: 'vasárnap', from: 'vasárnaptól' },
  { name: 'hétfő', on: 'hétfőn', from: 'hétfőtől' },
  { name: 'kedd', on: 'kedden', from: 'keddtől' },
  { name: 'szerda', on: 'szerdán', from: 'szerdától' },
  { name: 'csütörtök', on: 'csütörtökön', from: 'csütörtöktől' },
  { name: 'péntek', on: 'pénteken', from: 'péntektől' },
  { name: 'szombat', on: 'szombaton', from: 'szombattól' },
]

const MONTHS = [
  'január',
  'február',
  'március',
  'április',
  'május',
  'június',
  'július',
  'augusztus',
  'szeptember',
  'október',
  'november',
  'december',
]

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** 'szerda' */
export const dayName = (date: string) => DAYS[weekday(date)].name
/** 'szerdán' */
export const onDay = (date: string) => DAYS[weekday(date)].on
/** 'szerdától' */
export const fromDay = (date: string) => DAYS[weekday(date)].from

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number)
  return [y, m, d]
}

/** Column header: 'Szerda 10.28.' */
export function dayHeader(date: string): string {
  const [, month, day] = date.split('-')
  return `${capitalize(dayName(date))} ${month}.${day}.`
}

/** '2026. október 26.' */
export function formatDate(date: string): string {
  const [y, m, d] = parts(date)
  return `${y}. ${MONTHS[m - 1]} ${d}.`
}

/** '2026. október 26 – 30.', '2026. október 29 – november 2.', '2026. december 28. – 2027. január 1.' */
export function formatPeriod(days: string[]): string {
  if (days.length === 0) return ''
  if (days.length === 1) return formatDate(days[0])
  const [y1, m1, d1] = parts(days[0])
  const [y2, m2, d2] = parts(days[days.length - 1])
  if (y1 !== y2) return `${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`
  if (m1 !== m2) return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}.`
  return `${y1}. ${MONTHS[m1 - 1]} ${d1} – ${d2}.`
}

export const groupName = (group: number) => `${group}. csoport`
export const groupShort = (group: number) => `${group}. cs.`
export const shiftShort: Record<Shift, string> = { morning: 'DE', afternoon: 'DU' }

export const HOLE = 'BETÖLTETLEN'

/** 'H', 'K', 'Sze', … for the absence grid header. */
export const weekdayInitial = (date: string) =>
  ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'][weekday(date)]

/** '2026. október' from '2026-10'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}. ${MONTHS[m - 1]}`
}

/** 'ma', 'tegnap', '3 napja' */
export function sinceText(days: number): string {
  return days <= 0 ? 'ma' : days === 1 ? 'tegnap' : `${days} napja`
}

// ── Screens ──────────────────────────────────────────────────────────────────

export const ui = {
  appName: 'Óvodai beosztás',
  loading: 'Betöltés…',
  tabs: { staff: 'Munkatársak', absences: 'Távollétek', roster: 'Beosztás' },
  firstLaunch: {
    intro: 'Hogyan kezdjük?',
    start: 'Új kezdés',
    restore: 'Visszatöltés fájlból',
    demo: 'Bemutató adatok',
    storageError: 'A tárolt adatok nem olvashatók. Töltsd vissza a legutóbbi mentést.',
  },
  demoBanner: 'Bemutató adatok — nem valódi személyek',
  theme: { light: 'Világos téma', dark: 'Sötét téma' },
  leaveDemo: 'Kilépés a bemutatóból',
  footer: {
    lastBackup: 'Utolsó mentés:',
    never: 'még nem volt',
    backup: 'Mentés fájlba',
    restore: 'Visszatöltés fájlból',
    notPersisted: 'A böngésző nem garantálja a tárolást — ments gyakrabban fájlba.',
    saveFailed: 'Nem sikerült menteni a böngészőbe — ments fájlba!',
  },
  confirmRestore: 'Ez felülírja a jelenlegi adatokat. Folytatod?',
  restoreFailed: 'A fájl nem olvasható. Semmi sem változott.',
  staff: {
    fullName: 'Teljes név',
    displayName: 'Megjelenő név',
    role: 'Munkakör',
    active: 'Aktív',
    teacher: 'Óvónő',
    nanny: 'Dajka',
    teachers: 'Óvónők',
    nannies: 'Dajkák',
    add: { teacher: '+ Új óvónő', nanny: '+ Új dajka' },
    move: { teacher: '→ Óvónő', nanny: '→ Dajka' },
    moveHint: { teacher: 'Áthelyezés az óvónők közé', nanny: 'Áthelyezés a dajkák közé' },
    remove: 'Törlés',
    removeHint:
      'Végleges. Ha valaki csak egy ideig nem dolgozik, inkább vedd ki az Aktív jelölést.',
    activeHint:
      'Aki nem aktív, az nem kerül a beosztásba és a távolléti táblába. Bármikor visszakapcsolható.',
    confirmRemove: (name: string) => `Biztosan törlöd: ${name}?`,
    confirmRemoveRostered: (name: string) =>
      `${name} már szerepelt beosztásban. Ha csak egy ideig nem dolgozik, inkább vedd ki az ` +
      `Aktív jelölést — úgy bármikor visszajöhet.\n\n` +
      `Biztosan törlöd? A korábbi heteken a neve megmarad.`,
    duplicate: 'Ez a név kétszer szerepel.',
    empty: 'Még nincs munkatárs. Kattints az „Új óvónő” vagy az „Új dajka” gombra.',
    legendTitle: 'ⓘ Tudnivalók',
    legend: [
      'Aktív: csak az aktív munkatársak kerülnek a beosztásba. Aki egy ideig nem dolgozik (például tartós szabadság), annál vedd ki a jelölést. A nem aktívak a lista alján, szürkén látszanak.',
      'Törlés: végleges. Aki már szerepelt beosztásban, annak a neve a korábbi heteken megmarad.',
      'Megjelenő név: ez szerepel a beosztásban és a nyomtatásban. Legyen rövid, és ne legyen két egyforma.',
      'A → Dajka és → Óvónő gombbal lehet valakit a másik oszlopba tenni.',
    ],
  },
  absences: {
    hint: 'Kattints egy napra, vagy húzd végig az egeret a soron.',
    previous: 'Előző hónap',
    next: 'Következő hónap',
    noStaff: 'Előbb vedd fel a munkatársakat.',
  },
  roster: {
    groups: 'Csoportok:',
    previousWeek: 'Előző hét',
    nextWeek: 'Következő hét',
    saved: 'van mentett beosztás',
    solve: 'Számol',
    solving: 'Számolok… ez eltarthat néhány másodpercig.',
    print: 'Nyomtatás',
    excel: 'Excel letöltés',
    warnings: 'Figyelmeztetések',
    allGood: 'Nincs figyelmeztetés.',
    noDays: 'Ezen a héten nincs munkanap.',
    noStaff: 'Előbb vedd fel a munkatársakat.',
    notSolved: 'Erre a hétre még nincs beosztás. Kattints a Számol gombra.',
    staleTitle: 'Ez a beosztás elavult.',
    stale: 'A munkatársak, a távollétek vagy a csoportszám változott a számolás óta.',
    resolve: 'Újraszámol',
    warningsHint:
      'Napok szerint csoportosítva. A gombok egy kattintással módosítanak és újraszámolnak. ' +
      'Ha az egeret egy sorra viszed, a táblázatban kiemelődnek az érintett cellák.',
    daysHint:
      'Kattints egy napra, ha ott más csoportszám kell, vagy zárva van. „kézi” = ezen a napon kézzel állított csoportszám.',
    tableHint:
      'DE = délelőtt, DU = délután. nyit / zár = ő nyitja vagy zárja az óvodát (vastag betű). ' +
      'BETÖLTETLEN = nincs rá ember. Narancs = dajka helyett óvónő.',
    undo: '↶ Visszavonás',
    undoHint: 'Visszaállítja, ami a módosítás előtt volt — a beosztással együtt.',
    accept: 'Rendben',
    acceptHint: 'Megtartod a változást; a kiemelés eltűnik.',
    didSetGroups: (date: string, groups: number) =>
      `${capitalize(onDay(date))} ${groups} csoport beállítva.`,
    didCallIn: (name: string, date: string) => `${name} mégis jön ${onDay(date)}.`,
    didSolve: 'Újraszámolva.',
    changedCount: (count: number) =>
      count === 0
        ? 'A beosztás nem változott.'
        : `${count} cella változott — kiemelve a táblázatban.`,
    holes: (count: number) => `${count} hiány`,
    otherNotes: (count: number) => `Egyéb megjegyzések (${count})`,
    callIn: (name: string) => `${name} mégis jön`,
    callInHint: (name: string, date: string) =>
      `Törli ${name} távollétét ${onDay(date)}, és újraszámol.`,
    fixHint: (date: string, groups: number) =>
      `${capitalize(onDay(date))} ${groups} csoport indul, így nem marad üres óvónői hely. Újraszámol.`,
    errorGeneric: 'Hiba történt — frissítsd az oldalt.',
    errorInvalid: 'Hiba történt a beosztás készítésekor.',
    groupLabel: (group: number) => `${groupName(group)} neve (nem kötelező)`,
    dayGroups: 'Csoportok ezen a napon:',
    closeDay: 'Zárva',
    resetDay: 'Mint a többi nap',
    done: 'Kész',
    closed: 'zárva',
    fewTeachers: (have: number, groups: number, need: number) =>
      `csak ${have} óvónő — ${groups} csoporthoz ${need} kell`,
    fewNannies: (have: number, need: number) => `csak ${have} dajka — ${need} kell`,
    manual: (groups: number) => `kézi: ${groups} cs.`,
    fix: (date: string, groups: number) => `${capitalize(onDay(date))} ${groups} csoport`,
  },
  print: {
    groupTitle: (period: string) => `Beosztás — ${period}`,
    personTitle: (period: string) => `Beosztás munkatársanként — ${period}`,
  },
}

// ── Warnings (spec §7) ───────────────────────────────────────────────────────

/** 'a' or 'az' before a written number: az 1., az 5., a 2. */
const article = (n: number) => (n === 1 || n === 5 ? 'az' : 'a')

/** 'az 5-ből', 'a 3-ból' — periods have at most 6 days. */
const outOf = (n: number) => `${article(n)} ${n}-${n === 3 || n === 6 ? 'ból' : 'ből'}`

/** '2.', '2. és 3.', '3., 4. és 5.' */
function numberList(numbers: number[]): string {
  const items = numbers.map((n) => `${n}.`)
  return items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(', ')} és ${items[items.length - 1]}`
}

const shiftAdjective: Record<Shift, string> = { morning: 'délelőttös', afternoon: 'délutános' }

export type UnevenDetail =
  | { kind: 'morning' | 'afternoon'; count: number; of: number }
  | { kind: 'opener' | 'closer' | 'reserve'; count: number; of: number }

export const warningText = {
  noTeacher: (date: string) =>
    `${capitalize(onDay(date))} nincs óvónő — egy csoport sem indítható.`,
  callIn: (absentTeachers: string[]) =>
    absentTeachers.length > 0
      ? `Hívj be valakit: ${absentTeachers.join(', ')} (távol).`
      : 'Hívj be valakit.',
  teacherSeatEmpty: (date: string, group: number, shift: Shift, times: string) =>
    `${capitalize(dayName(date))}, ${groupShort(group)}: nincs ${shiftAdjective[shift]} óvónő (${times}).`,
  teacherSeatAction: 'Hívj be valakit, vagy vond össze a csoportot.',
  keyMissing: (date: string, key: 'opener' | 'closer', nannies: number) =>
    `${capitalize(onDay(date))} nincs ${key === 'opener' ? 'nyitó' : 'záró'} — ${
      nannies === 0 ? 'nincs dajka' : 'csak 1 dajka dolgozik'
    }.`,
  openerAction: 'Valaki jöjjön 6:00-ra, vagy nyisson később az óvoda.',
  closerAction: 'Valaki maradjon 18:00-ig, vagy zárjon korábban az óvoda.',
  groupsReduced: (
    date: string,
    groups: number,
    target: number,
    teachers: number,
    nannies: number,
  ) => {
    const merged = Array.from({ length: target - groups }, (_, i) => groups + 1 + i)
    const into = groups === 1 ? 'az 1.-vel' : 'a többivel'
    return (
      `${capitalize(onDay(date))} ${groups} csoport indul ${target} helyett (${teachers} óvónő, ${nannies} dajka). ` +
      `${capitalize(article(merged[0]))} ${numberList(merged)} cs. összevonva ${into}.`
    )
  },
  groupsOverridden: (date: string, groups: number) =>
    `${capitalize(dayName(date))}: ${groups} csoport (kézi beállítás).`,
  substitution: (date: string, group: number, name: string) =>
    `${capitalize(dayName(date))}, ${groupShort(group)}: dajka helyett óvónő — ${name}.`,
  closedDay: (date: string) => `${capitalize(onDay(date))} zárva.`,
  groupSwitch: (name: string, date: string, group: number) =>
    `${name} ${fromDay(date)} ${article(group)} ${group}. csoportban.`,
  turnaround: (name: string, late: string, early: string) =>
    `${name} ${onDay(late)} 18:00-ig, ${onDay(early)} 6:00-tól.`,
  uneven: (name: string, detail: UnevenDetail) => {
    const what = {
      morning: `${detail.count} délelőttös műszak`,
      afternoon: `${detail.count} délutános műszak`,
      opener: `${detail.count} napon nyit`,
      closer: `${detail.count} napon zár`,
      reserve: `${detail.count} napon tartalék`,
    }[detail.kind]
    return `Egyenlő elosztás nem volt lehetséges: ${name} ${what} ${outOf(detail.of)}.`
  },
}

export const LEGEND = [
  'DE = délelőtt, DU = délután. Félkövér: nyit (6:00) vagy zár (18:00).',
  'Óvónő: DE 7:00–13:30, DU 10:30–17:00; pénteken és ledolgozós szombaton DE 7:00–13:00, DU 11:00–17:00.',
  'Dajka: DE 6:00–14:00, DU 10:00–18:00.',
]
