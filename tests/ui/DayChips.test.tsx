// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DayCapacity } from '../../src/core/capacity'
import { DayChips } from '../../src/ui/DayChips'

afterEach(cleanup)

/** A day's capacity with the fields the chip reads; `groups` capped as dayCapacities caps it. */
function capacity(spec: Partial<DayCapacity> = {}): DayCapacity {
  const teachers = spec.teachers ?? 4
  const nannies = spec.nannies ?? 2
  return {
    date: '2026-10-26',
    teachers,
    nannies,
    assistants: 0,
    civils: 0,
    requested: 2,
    gMax: Math.min(teachers, Math.floor((teachers + nannies) / 2)),
    groups: 2,
    closed: false,
    ...spec,
  }
}

describe('DayChips', () => {
  it('warns when no teacher is present, even if the nannies are enough', () => {
    // The chips are the only warning before Számol: g_max 0 means no group can start.
    render(
      <DayChips
        capacities={[capacity({ teachers: 0, nannies: 3, gMax: 0, groups: 0, requested: 2 })]}
        onEdit={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button')
    expect(chip.className).toContain('warn')
  })

  it('warns when helpers cover every seat but too few teachers can open the groups', () => {
    // 1 teacher + 4 assistants: every teacher seat can be filled, yet only 1 group can start, not 2.
    const c = capacity({ teachers: 1, nannies: 2, assistants: 4, gMax: 1, groups: 1, requested: 2 })
    render(<DayChips capacities={[c]} onEdit={vi.fn()} />)
    expect(screen.getByRole('button').className).toContain('warn')
  })

  it('is happy when the day has the people its groups need', () => {
    render(<DayChips capacities={[capacity()]} onEdit={vi.fn()} />)
    expect(screen.getByRole('button').className).toContain('ok')
  })

  it('does not open the editor for a day before the week starts, where a change cannot land', () => {
    const onEdit = vi.fn()
    render(
      <DayChips
        capacities={[capacity(), { ...capacity(), date: '2026-10-28' }]}
        onEdit={onEdit}
        from="2026-10-28"
      />,
    )
    const [past, today] = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(past.disabled).toBe(true)
    expect(today.disabled).toBe(false)
    fireEvent.click(past)
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.click(today)
    expect(onEdit).toHaveBeenCalledWith('2026-10-28')
  })
})
