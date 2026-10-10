import type { AmbulanceType, RequestPriority } from '@prisma/client'

export const MAX_REPORT_DAYS = 90
const DAY_MS = 86_400_000

export interface ReportRow {
  requestedAt: Date
  assignedAt: Date | null
  priority: RequestPriority
  cancelReason: string | null
  ambulanceType: AmbulanceType | null
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/** Resolves the inclusive UTC day range, defaulting to the last 7 days ending today. */
export function resolveRange(from?: Date, to?: Date, now = new Date()) {
  const end = startOfUtcDay(to ?? now)
  const start = startOfUtcDay(from ?? new Date(end.getTime() - 6 * DAY_MS))
  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1
  return { start, end, days }
}

export function buildSummary(rows: ReportRow[], start: Date, days: number) {
  const perDay = new Map<string, { requests: number; responseMs: number; responded: number }>()
  for (let i = 0; i < days; i++) {
    const key = new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10)
    perDay.set(key, { requests: 0, responseMs: 0, responded: 0 })
  }

  const byPriority = { CRITICAL: 0, HIGH: 0, NORMAL: 0 }
  const byAmbulanceType = { BASIC: 0, ICU: 0, CARDIAC: 0 }
  const reasons = new Map<string, number>()

  for (const row of rows) {
    const bucket = perDay.get(row.requestedAt.toISOString().slice(0, 10))
    if (!bucket) continue
    bucket.requests++
    if (row.assignedAt) {
      bucket.responseMs += row.assignedAt.getTime() - row.requestedAt.getTime()
      bucket.responded++
    }
    byPriority[row.priority]++
    if (row.ambulanceType) byAmbulanceType[row.ambulanceType]++
    if (row.cancelReason) {
      const reason = row.cancelReason.trim()
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    }
  }

  const cancellationReasons = [...reasons.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))

  let total = 0
  const perDayList = [...perDay.entries()].map(([date, b]) => {
    total += b.requests
    return {
      date,
      requests: b.requests,
      avgResponseMinutes:
        b.responded === 0 ? null : Math.round((b.responseMs / b.responded / 60_000) * 10) / 10,
    }
  })

  return { total, perDay: perDayList, byPriority, byAmbulanceType, cancellationReasons }
}
