import { describe, expect, it } from 'vitest'
import { buildSummary, resolveRange } from '../src/modules/admin/admin.reports'

describe('report summary helpers', () => {
  it('defaults to the last 7 UTC days ending today', () => {
    const { start, days } = resolveRange(undefined, undefined, new Date('2026-10-10T15:00:00Z'))
    expect(days).toBe(7)
    expect(start.toISOString()).toBe('2026-10-04T00:00:00.000Z')
  })

  it('fills empty days and aggregates counts', () => {
    const start = new Date('2026-10-01T00:00:00Z')
    const summary = buildSummary(
      [
        {
          requestedAt: new Date('2026-10-01T10:00:00Z'),
          assignedAt: new Date('2026-10-01T10:04:00Z'),
          priority: 'CRITICAL',
          cancelReason: null,
          ambulanceType: 'ICU',
        },
        {
          requestedAt: new Date('2026-10-01T11:00:00Z'),
          assignedAt: new Date('2026-10-01T11:07:00Z'),
          priority: 'NORMAL',
          cancelReason: null,
          ambulanceType: null,
        },
        {
          requestedAt: new Date('2026-10-03T09:00:00Z'),
          assignedAt: null,
          priority: 'HIGH',
          cancelReason: 'Patient found another ride',
          ambulanceType: null,
        },
      ],
      start,
      3,
    )
    expect(summary.total).toBe(3)
    expect(summary.perDay).toEqual([
      { date: '2026-10-01', requests: 2, avgResponseMinutes: 5.5 },
      { date: '2026-10-02', requests: 0, avgResponseMinutes: null },
      { date: '2026-10-03', requests: 1, avgResponseMinutes: null },
    ])
    expect(summary.byPriority).toEqual({ CRITICAL: 1, HIGH: 1, NORMAL: 1 })
    expect(summary.byAmbulanceType).toEqual({ BASIC: 0, ICU: 1, CARDIAC: 0 })
    expect(summary.cancellationReasons).toEqual([
      { reason: 'Patient found another ride', count: 1 },
    ])
  })
})
