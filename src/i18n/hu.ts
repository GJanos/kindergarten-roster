import { weekday } from '../core/calendar'
import { shiftTimes } from '../core/shifts'
import type { AbsenceKind, Assignment, Role, SeatShift, Shift } from '../core/types'

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

/** '10.28.' */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${month}.${day}.`
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
export const shiftShort: Record<Shift, string> = { morning: 'DE', afternoon: 'DU', day: 'NAP' }
/** A helper's hours, short (v3-c): 'Asszisztens: Bea (8–16)'. */
export const helperShort: Record<Shift, string> = {
  day: '8–16',
  morning: '6–14',
  afternoon: '10–18',
}

/** Ügyelet in the group view: the teacher's shifted start, or end (v3-b). */
export const DUTY = 'Ügyelet'
export const dutyMark: Record<SeatShift, string> = {
  morning: ' 6:30-tól',
  afternoon: ' 17:30-ig',
}

export const HOLE = 'BETÖLTETLEN'

/** An absence as the printout and Excel name it. */
export const ABSENCE_WORD: Record<AbsenceKind, string> = {
  leave: 'szabadság',
  sick: 'beteg',
  other: 'távol',
}

/** 'H', 'K', 'Sze', … for the absence grid header. */
export const weekdayInitial = (date: string) =>
  ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'][weekday(date)]

/** '2026. október' from '2026-10'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y}. ${MONTHS[m - 1]}`
}

/** A month's sorted dates as day numbers, consecutive days joined: '6–8., 20.' */
export function compactDates(dates: string[]): string {
  const runs: [number, number][] = []
  for (const day of dates.map((date) => Number(date.slice(8)))) {
    const last = runs.at(-1)
    if (last && day === last[1] + 1) last[1] = day
    else runs.push([day, day])
  }
  return runs.map(([from, to]) => (from === to ? `${from}.` : `${from}–${to}.`)).join(', ')
}

/** 'ma', 'tegnap', '3 napja' */
export function sinceText(days: number): string {
  return days <= 0 ? 'ma' : days === 1 ? 'tegnap' : `${days} napja`
}

// ── Screens ──────────────────────────────────────────────────────────────────

/** Who to ask first when someone must come in: people on leave, then other absences, the sick last. */
export const CALL_IN_ORDER: Record<AbsenceKind, number> = { leave: 0, other: 1, sick: 2 }

// Where a solve stopped early: the solver stage, in her words.
const STOPPED_AT: Record<string, string> = {
  holes: 'a hiányoknál',
  substitutions: 'a helyettesítéseknél',
  keepPeople: 'a változtatások számánál',
  keepHours: 'a változtatások számánál',
  keepDuties: 'a változtatások számánál',
  helpers: 'az asszisztensek elhelyezésénél',
  worstGap: 'az egyenlő elosztásnál',
  totalGap: 'az egyenlő elosztásnál',
  pairs: 'a dajkapároknál',
  balance: 'a délelőtt–délután egyensúlynál',
  switches: 'a csoportváltásoknál',
  turnarounds: 'a zárás utáni korai nyitásoknál',
  keysSeated: 'a nyitó és záró dajkáknál',
}

/** The strict rules a hand edit can break (validate.ts rule names), most telling first. */
const EDIT_REASONS: [rule: string, reason: string][] = [
  ['nannyInTeacherSeat', 'dajka nem ülhet óvónői helyre'],
  ['civilInTeacherSeat', 'civil nem ülhet óvónői helyre'],
  ['assistantNotAfternoon', 'asszisztens csak délután, 10–18-ban állhat be óvónő helyett'],
  ['assistantInNannySeat', 'asszisztens nem ülhet dajka helyére'],
  ['helperSeatNotAssistant', 'a csoport mellé csak asszisztens ülhet'],
  ['groupWithoutTeacher', 'így egy csoportban nem maradna óvónő'],
  ['helperWithoutTeacher', 'asszisztens csak óvónő mellett lehet csoportban'],
  ['standInOnDay', 'dajka helyett csak 6–14 vagy 10–18 lehet'],
  ['dayShiftNotHelper', '8–16 csak asszisztensnek és civilnek van'],
  ['keyNotNanny', 'nyitni és zárni csak dajka tud'],
  ['openerNotMorning', 'aki nyit, annak 6:00-ra kell jönnie'],
  ['closerNotAfternoon', 'aki zár, annak 18:00-ig kell maradnia'],
  ['openerEveryDay', 'így valaki minden nap nyitna'],
  ['closerEveryDay', 'így valaki minden nap zárna'],
]
const refusal = (rules: string[]) =>
  EDIT_REASONS.find(([rule]) => rules.includes(rule))?.[1] ?? 'megszegne egy szabályt'

export const ui = {
  appName: 'Óvodai beosztás',
  loading: 'Betöltés…',
  tabs: { staff: 'Munkatársak', absences: 'Távollétek', roster: 'Beosztás', balance: 'Egyenleg' },
  firstLaunch: {
    intro: 'Hogyan kezdjük?',
    start: 'Új kezdés',
    restore: 'Visszatöltés fájlból',
    demo: 'Bemutató adatok',
    storageError: 'A tárolt adatok nem olvashatók. Töltsd vissza a legutóbbi mentést.',
  },
  demoBanner: 'Bemutató adatok — nem valódi személyek',
  theme: { light: 'Világos téma', dark: 'Sötét téma' },
  otherWindow: {
    title: 'Az alkalmazás egy másik ablakban már nyitva van.',
    body: 'Egyszerre csak egy ablakban lehet dolgozni, különben a változások felülírnák egymást. Zárd be ezt az ablakot, vagy folytasd itt — akkor a másik ablak áll meg.',
    takeOver: 'Használat ebben az ablakban',
  },
  leaveDemo: 'Kilépés a bemutatóból',
  footer: {
    lastBackup: 'Utolsó mentés:',
    never: 'még nem volt',
    backup: 'Mentés fájlba',
    restore: 'Visszatöltés fájlból',
    notPersisted: 'A böngésző nem garantálja a tárolást — ments gyakrabban fájlba.',
    saveFailed: 'Nem sikerült menteni a böngészőbe — ments fájlba!',
    version: (build: string) => `Verzió: ${build}`,
  },
  /** Autosave to a folder she picks (2026-10-18). */
  autosave: {
    enable: 'Automatikus mentés…',
    hint:
      'Kiválasztasz egy mappát, és néhány percenként oda menti a napi mentést (ovoda-mentes-ÉÉÉÉ-HH-NN.json), ' +
      'ha valami változott. Naponta egy fájl, a korábbi napoké megmarad. Csak Chrome-ban és Edge-ben.',
    on: (folder: string) => `Automatikus mentés bekapcsolva → ${folder}`,
    saved: (time: string, folder: string, file: string) =>
      `Automatikus mentés: ${time} → ${folder}/${file}`,
    interval: 'Automatikus mentés gyakorisága',
    every: (minutes: number) => `${minutes} percenként`,
    disable: 'Kikapcsolás',
    paused: 'Az automatikus mentés szünetel — a böngésző újra engedélyt kér a mappához.',
    allow: 'Engedélyezés',
    failed: 'Az automatikus mentés nem sikerült (megvan még a mappa?).',
    retry: 'Újra',
    demo: 'Bemutató módban nincs automatikus mentés.',
    unsupported:
      'Automatikus mentés: ebben a böngészőben nem érhető el — Chrome-ban vagy Edge-ben működik.',
  },
  confirmRestore: 'Ez felülírja a jelenlegi adatokat. Folytatod?',
  restoreFailed: 'A fájl nem olvasható. Semmi sem változott.',
  staff: {
    fullName: 'Teljes név',
    displayName: 'Megjelenő név',
    role: 'Munkakör',
    active: 'Aktív',
    roleHint: 'Ha valaki más munkakörbe kerül, itt állítsd át.',
    roles: {
      teacher: 'Óvónő',
      nanny: 'Dajka',
      assistant: 'Pedagógiai asszisztens',
      civil: 'Civil',
    } satisfies Record<Role, string>,
    sections: {
      teacher: 'Óvónők',
      nanny: 'Dajkák',
      assistant: 'Pedagógiai asszisztensek',
      civil: 'Civilek',
    } satisfies Record<Role, string>,
    add: {
      teacher: '+ Új óvónő',
      nanny: '+ Új dajka',
      assistant: '+ Új asszisztens',
      civil: '+ Új civil',
    } satisfies Record<Role, string>,
    remove: 'Törlés',
    removeHint:
      'Végleges. Ha valaki csak egy ideig nem dolgozik, inkább vedd ki az Aktív jelölést.',
    activeHint:
      'Aki nem aktív, az nem kerül a beosztásba és a távolléti táblába. Bármikor visszakapcsolható.',
    leaveAllowance: 'Szabadság/év',
    leaveAllowanceHint:
      'Éves szabadságkeret napokban. Üresen hagyva nem követjük. A Távollétek és a Munkatársak ' +
      'fülön látszik, mennyi maradt belőle.',
    leaveLeft: (year: string) => `Maradt (${year})`,
    leaveCarry: (year: string) => `Áthozott (${year})`,
    leaveCarryHint:
      'Az előző évből áthozott szabadságnapok, a keret fölött. Másik évét a Távollétek fülön, ' +
      'a név melletti gombbal írhatod be.',
    confirmRemove: (name: string) => `Biztosan törlöd: ${name}?`,
    confirmRemoveRostered: (name: string) =>
      `${name} már szerepelt beosztásban. Ha csak egy ideig nem dolgozik, inkább vedd ki az ` +
      `Aktív jelölést — úgy bármikor visszajöhet.\n\n` +
      `Biztosan törlöd? A korábbi heteken a neve megmarad.`,
    duplicate: 'Ez a név kétszer szerepel.',
    empty: 'Még nincs munkatárs. Kattints valamelyik „Új …” gombra.',
    yearBalance: (year: number) =>
      `Éves egyenleg (${year}/${String((year + 1) % 100).padStart(2, '0')})`,
    yearBalanceHint:
      'Az idei nevelési év (szeptember 1-től) mentett beosztásaiból, az előre megtervezett ' +
      'hetekkel együtt. Zárójelben: ennyivel több (+) vagy ' +
      'kevesebb (−) jutott neki az egyenlő résznél. Ahol egy hét nem osztható el egyenlően, a ' +
      'következő beosztás ezt egyenlíti ki.',
    yearBalanceNoStaff: 'Még nincs munkatárs. A Munkatársak fülön veheted fel őket.',
    yearBalanceEmpty:
      'Még üres: az idei első mentett beosztás után itt látod, ki hányszor volt délelőttös, ' +
      'délutános, nyitó, záró, tartalék vagy ügyeletes.',
    yearColumns: ['Név', 'Délelőtt', 'Délután', 'Nyit', 'Zár', 'Tartalék', 'Ügyelet'],
    legendTitle: 'ⓘ Tudnivalók',
    legend: [
      'Aktív: csak az aktív munkatársak kerülnek a beosztásba. Aki egy ideig nem dolgozik (például tartós szabadság), annál vedd ki a jelölést. A nem aktívak a lista alján, szürkén látszanak.',
      'Törlés: végleges. Aki már szerepelt beosztásban, annak a neve a korábbi heteken megmarad.',
      'Megjelenő név: ez szerepel a beosztásban és a nyomtatásban. Legyen rövid, és ne legyen két egyforma.',
      'Munkakör: a listából lehet valakit másik munkakörbe tenni. Az asszisztens és a civil nem számít az egyenlő elosztásba.',
      'Szabadság/év: ha megadod, a Távollétek és a Munkatársak fülön látszik, mennyi maradt a keretből.',
    ],
  },
  absences: {
    hint: 'Válaszd ki a fajtát, aztán kattints egy napra, vagy húzd végig az egeret a soron. Ugyanazzal a fajtával újra kattintva törlöd.',
    previous: 'Előző hónap',
    next: 'Következő hónap',
    previousWeek: 'Előző hét',
    nextWeek: 'Következő hét',
    views: { month: 'Hónap', week: 'Hét' },
    viewsLabel: 'Nézet',
    noStaff: 'Előbb vedd fel a munkatársakat.',
    kindsLabel: 'Távollét fajtája',
    kinds: { leave: 'Szabadság', sick: 'Beteg', other: 'Egyéb' } satisfies Record<
      AbsenceKind,
      string
    >,
    letters: { leave: 'Sz', sick: 'B', other: 'E' } satisfies Record<AbsenceKind, string>,
    leaveHeader: (year: string) => `Szabadság ${year}`,
    balance: (remaining: number) =>
      remaining >= 0 ? `${remaining} maradt` : `${-remaining} nappal túllépve`,
    balanceHint: (year: string, used: number, allowance: number, carry: number) =>
      `Szabadság ${year}: ${used} nap kivéve, ${allowance + carry} összesen` +
      (carry > 0 ? ` (${allowance} + ${carry} áthozott)` : '') +
      '. Kattints az áthozott napokhoz.',
    report: {
      open: 'Havi kimutatás',
      title: (month: string) => `Távollétek — ${monthLabel(month)}`,
      columns: ['Név', 'Szabadság', 'Beteg', 'Egyéb', 'Összesen', 'Napok', 'Szabadság maradt'],
      made: (date: string) => `Készült: ${date.replaceAll('-', '.')}.`,
      print: 'Nyomtatás',
      close: 'Bezár',
    },
    carry: (year: string) => `Áthozott napok (${year})`,
    away: {
      teacher: 'Távol (óvónő)',
      nanny: 'Távol (dajka)',
      assistant: 'Távol (asszisztens)',
      civil: 'Távol (civil)',
    } satisfies Record<Role, string>,
    shortHint:
      'Narancs: aznap kevesebben maradnak, mint amennyi a hét csoportszámához kell (csoportonként 2 óvónő, 1 dajka, de legalább 2 dajka). ' +
      'Asszisztens egy délutános óvónőt, civil egy dajkát pótolhat. Vidd az egeret a narancs mezőre: kiírja, mennyien maradnak.',
    shortTeachers: (teachers: number, assistants: number, groups: number, need: number) =>
      `Kevés óvónő: ${teachers} óvónő${assistants > 0 ? ` + ${assistants} asszisztens` : ''} marad, ${groups} csoporthoz ${need} kell.`,
    shortNannies: (nannies: number, civils: number, need: number) =>
      `Kevés dajka: ${nannies} dajka${civils > 0 ? ` + ${civils} civil` : ''} marad, ${need} kell.`,
    today: 'Ma',
  },
  roster: {
    groups: 'Csoportok:',
    previousWeek: 'Előző hét',
    nextWeek: 'Következő hét',
    saved: 'van mentett beosztás',
    solve: 'Számol',
    solving: 'Számolok… ez akár egy-két percig is eltarthat.',
    print: 'Nyomtatás',
    excel: 'Excel letöltés',
    warnings: 'Figyelmeztetések',
    allGood: 'Nincs figyelmeztetés.',
    noDays: 'Ezen a héten nincs munkanap.',
    noStaff: 'Előbb vedd fel a munkatársakat.',
    notSolved: 'Erre a hétre még nincs beosztás. Kattints a Számol gombra.',
    archivedBadge: 'Archív',
    archived:
      'Ez a hét már elmúlt — a beosztás archív, nem módosítható. Nyomtatni és letölteni lehet.',
    archivedEmpty: 'Ehhez a héthez nincs mentett beosztás.',
    /** Undefined for the year balance: its leftover evens out next week by itself. */
    stoppedEarly: (stage: string): string | undefined => {
      if (stage === 'yearly') return undefined
      const where = STOPPED_AT[stage] ?? 'az egyik szempontnál'
      return (
        `Nagy hét: ${where} a számolás az időkorlát miatt a legjobb addig talált megoldással ` +
        'állt meg. A beosztás érvényes, minden szabályt betart.'
      )
    },
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
      'BETÖLTETLEN = nincs rá ember. Narancs = valaki más helyett (óvónő a dajka, civil a dajka, asszisztens a DU óvónő helyett). ' +
      'Két nevet egymás után kattintva (ugyanazon a napon) a két ember helyet cserél.',
    undo: '↶ Visszavonás',
    undoHint: 'Visszaállítja, ami a módosítás előtt volt — a beosztással együtt.',
    accept: 'Rendben',
    acceptHint: 'Megtartod a változást; a kiemelés eltűnik.',
    didSetGroups: (date: string, groups: number) =>
      `${capitalize(onDay(date))} ${groups} csoport beállítva.`,
    didCallIn: (name: string, date: string) => `${name} mégis jön ${onDay(date)}.`,
    didSolve: 'Újraszámolva.',
    didSwap: (a: string, b: string, date: string) => `Csere: ${a} ↔ ${b}, ${dayName(date)}.`,
    didShift: (name: string, hours: string, date: string) => `${name}: ${hours}, ${dayName(date)}.`,
    shiftHint: 'Másik munkaidő ennek a segítőnek ezen a napon.',
    picked: (name: string, date: string) =>
      `${name} kiválasztva (${dayName(date)}) — kattints arra, akivel cserél.`,
    cancel: 'Mégse',
    swapRefused: (rules: string[]) => `Ez a csere nem lehetséges: ${refusal(rules)}.`,
    shiftRefused: (rules: string[]) => `Ez a műszak nem lehetséges: ${refusal(rules)}.`,
    editedBadge: 'kézzel módosítva',
    confirmDropEdits: 'A kézi cserék elvesznek. Újraszámolod?',
    changedCount: (count: number) =>
      count === 0
        ? 'A beosztás nem változott.'
        : `${count} cella változott — kiemelve a táblázatban.`,
    holes: (count: number) => `${count} hiány`,
    otherNotes: (count: number) => `Egyéb megjegyzések (${count})`,
    callIn: (name: string, sick?: boolean) => `${name} mégis jön${sick ? ' (beteg)' : ''}`,
    callInHint: (name: string, date: string) =>
      `Kijelöli: törli ${name} távollétét ${onDay(date)}. A kijelöltek egyszerre számolódnak újra.`,
    fixHint: (date: string, groups: number) =>
      `Kijelöli: ${onDay(date)} ${groups} csoport indul, így nem marad üres óvónői hely. A kijelöltek egyszerre számolódnak újra.`,
    /** Quick fixes in one go (2026-10-18): what the selections leave, and the dock bar. */
    expected: (holes: number) =>
      holes === 0 ? '→ várhatóan rendben' : `→ várhatóan ${holes} hiány`,
    expectedHint: 'A kijelölt változtatásokkal, a létszám alapján — még nincs újraszámolva.',
    pendingTitle: (count: number) => `${count} változtatás kijelölve:`,
    pendingCallIn: (name: string, date: string) => `${name} mégis jön ${onDay(date)}`,
    applyFixes: 'Alkalmaz és újraszámol',
    didFixes: (parts: string[]) => `${parts.length} változtatás: ${parts.join(' · ')}.`,
    errorGeneric: 'Hiba történt — frissítsd az oldalt.',
    errorInvalid: 'Hiba történt a beosztás készítésekor.',
    groupLabel: (group: number) => `${groupName(group)} neve (nem kötelező)`,
    dayGroups: 'Csoportok ezen a napon:',
    closeDay: 'Zárva',
    resetDay: 'Mint a többi nap',
    done: 'Kész',
    closed: 'zárva',
    fewTeachers: (teachers: number, assistants: number, groups: number, need: number) =>
      `csak ${teachers} óvónő${assistants > 0 ? ` + ${assistants} asszisztens` : ''} — ${groups} csoporthoz ${need} kell`,
    fewNannies: (nannies: number, civils: number, need: number) =>
      `csak ${nannies} dajka${civils > 0 ? ` + ${civils} civil` : ''} — ${need} kell`,
    manual: (groups: number) => `kézi: ${groups} cs.`,
    fix: (date: string, groups: number) => `${capitalize(onDay(date))} ${groups} csoport`,
  },
  recalc: {
    started: 'A hét már elkezdődött — a korábbi napok változatlanok maradnak.',
    minimal: 'Csak a szükséges változtatások',
    minimalHint: 'A lehető legkevesebb munkatárs beosztása változik, a többieké marad.',
    full: 'Mától mindent újraszámol',
    fullHint:
      'Mától az egész hetet újraosztja az egyenlő elosztás szerint — sok beosztás változhat.',
    sick: 'Beteg lett…',
    sickUntil: (name: string, date: string) => `${name} beteg ${fromDay(date)} — meddig?`,
    sickGo: 'Beteg — újraszámol',
    didSick: (name: string, from: string, to: string) =>
      `${name} beteg: ${shortDate(from)}${to > from ? `–${shortDate(to)}` : ''}`,
    callTitle: (count: number) => `${count} munkatárs ideje változott — őket érdemes felhívni:`,
    tellTitle: (count: number) => `${count} munkatársnak csak a helye vagy a kulcsa változott:`,
    unchanged: 'Senki más beosztása nem változott.',
    /** 'Kati — ma: nem nyit · kedd: 1. cs. (eddig csoporton kívül)' */
    person: (name: string, days: string[]) => `${name} — ${days.join(' · ')}`,
    /**
     * Only what changed on one day: new hours (with the old shift) and where, or else the move;
     * then a key taken on or given up. 'szerda: DE 6:00–14:00 (eddig DU), 1. cs., nyit, nem zár'
     */
    day: (role: Role, was: Assignment, now: Assignment, isToday: boolean) => {
      const place = (a: Assignment) => (a.seat ? groupShort(a.seat.group) : 'csoporton kívül')
      const parts: string[] = []
      if (now.shift !== was.shift || !now.duty !== !was.duty) {
        const times = shiftTimes(role, now.shift, now.date, now.duty)
        const shift = `${shiftShort[now.shift]}${now.duty ? ' ügyelet' : ''}`
        const before =
          now.shift !== was.shift
            ? `eddig ${shiftShort[was.shift]}${was.duty ? ' ügyelet' : ''}`
            : was.duty
              ? 'eddig ügyeletes'
              : 'eddig nem ügyeletes'
        parts.push(`${shift} ${times} (${before})`, place(now))
      } else if (place(now) !== place(was)) {
        parts.push(`${place(now)} (eddig ${place(was)})`)
      }
      if (now.substitution && !was.substitution)
        parts.push(now.seat?.kind === 'teacher' ? 'óvónő helyett' : 'dajka helyett')
      if (!now.opener !== !was.opener) parts.push(now.opener ? 'nyit' : 'nem nyit')
      if (!now.closer !== !was.closer) parts.push(now.closer ? 'zár' : 'nem zár')
      if (parts.length === 0) parts.push(place(now))
      return `${isToday ? 'ma' : dayName(now.date)}: ${parts.join(', ')}`
    },
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

const shiftAdjective: Record<SeatShift, string> = { morning: 'délelőttös', afternoon: 'délutános' }

export type UnevenDetail =
  | { kind: 'morning' | 'afternoon'; count: number; of: number }
  | { kind: 'opener' | 'closer' | 'reserve' | 'duty'; count: number; of: number }

/** "2 délutánnal több": the instrumental of each count, after a number. */
const yearNoun: Record<UnevenDetail['kind'], string> = {
  morning: 'délelőttel',
  afternoon: 'délutánnal',
  opener: 'nyitással',
  closer: 'zárással',
  reserve: 'tartaléknappal',
  duty: 'ügyelettel',
}

export const warningText = {
  noTeacher: (date: string) =>
    `${capitalize(onDay(date))} nincs óvónő — egy csoport sem indítható.`,
  callIn: (absentTeachers: string[]) =>
    absentTeachers.length > 0
      ? `Hívj be valakit: ${absentTeachers.join(', ')} (távol).`
      : 'Hívj be valakit.',
  teacherSeatEmpty: (date: string, group: number, shift: SeatShift, times: string) =>
    `${capitalize(dayName(date))}, ${groupShort(group)}: nincs ${shiftAdjective[shift]} óvónő (${times}).`,
  teacherSeatAction: 'Hívj be valakit, vagy vond össze a csoportot.',
  keyMissing: (date: string, key: 'opener' | 'closer', nannies: number) =>
    `${capitalize(onDay(date))} nincs ${key === 'opener' ? 'nyitó' : 'záró'} — ${
      nannies === 0 ? 'nincs dajka' : 'csak 1 dajka dolgozik'
    }.`,
  dutyMissing: (date: string) =>
    `${capitalize(onDay(date))} nincs ügyeletes csoport: egy csoportban sincs meg mindkét óvónő.`,
  dutyAction: 'Hívj be egy óvónőt, vagy vond össze a csoportokat.',
  pairSame: (date: string, group: number, shift: Shift) =>
    `${capitalize(dayName(date))}, ${group}–${group + 1}. cs.: mindkét dajka ${shiftShort[shift]}.`,
  shiftImbalance: (date: string, role: Role, morning: number, afternoon: number) =>
    `${capitalize(dayName(date))}: ${role === 'teacher' ? 'óvónők' : 'dajkák'} ${morning} DE / ${afternoon} DU.`,
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
  /** Why a helper's hours moved (v3-c): 'Hétfő: Bea 10–18, mert az 1. csoport DU óvónője hiányzik.' */
  helperStandIn: (
    date: string,
    group: number,
    seat: 'teacher' | 'nanny',
    name: string,
    hours: string,
  ) =>
    `${capitalize(dayName(date))}: ${name} ${hours}, mert ${article(group)} ${groupName(group)} ${
      seat === 'teacher' ? 'DU óvónője' : 'dajkája'
    } hiányzik.`,
  closedDay: (date: string) => `${capitalize(onDay(date))} zárva.`,
  groupSwitch: (name: string, date: string, from: number, to: number) =>
    `${name} ${onDay(date)} ${article(from)} ${from}. csoportból ${article(to)} ${to}. csoportba kerül.`,
  turnaround: (name: string, late: string, early: string) =>
    `${name} ${onDay(late)} 18:00-ig, ${onDay(early)} 6:00-tól.`,
  uneven: (name: string, detail: UnevenDetail, yearly?: number) => {
    const what = {
      morning: `${detail.count} délelőttös műszak`,
      afternoon: `${detail.count} délutános műszak`,
      opener: `${detail.count} napon nyit`,
      closer: `${detail.count} napon zár`,
      reserve: `${detail.count} napon tartalék`,
      duty: `${detail.count} napon ügyeletes`,
    }[detail.kind]
    const text = `Egyenlő elosztás nem volt lehetséges: ${name} ${what} ${outOf(detail.of)}.`
    if (yearly === undefined || Math.abs(yearly) < 1) return text
    const days = Math.round(Math.abs(yearly))
    return `${text} Idén eddig ${days} ${yearNoun[detail.kind]} ${yearly > 0 ? 'több' : 'kevesebb'} jutott neki.`
  },
}

export const LEGEND = [
  'DE = délelőtt, DU = délután. Félkövér: nyit (6:00) vagy zár (18:00).',
  'Óvónő: DE 7:00–13:30, DU 10:30–17:00; pénteken és ledolgozós szombaton DE 7:00–13:00, DU 11:00–17:00.',
  'Dajka: DE 6:00–14:00, DU 10:00–18:00.',
  'Ügyelet: a csoport óvónői DE 6:30-tól, DU 17:30-ig dolgoznak, ugyanannyi órában.',
  'Asszisztens, civil: NAP 8:00–16:00; ha valakit helyettesít, DE 6:00–14:00 vagy DU 10:00–18:00.',
]
