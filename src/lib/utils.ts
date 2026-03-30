import type { DebtType, ReportStatus } from '../types'

// ─────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────
export const fmt = (n: number | null | undefined) =>
  Math.round(n || 0).toLocaleString('ru-KZ') + ' ₸'

export const fmtS = (n: number | null | undefined) =>
  (n && n > 0 ? '+' : '') + Math.round(n || 0).toLocaleString('ru-KZ') + ' ₸'

// ─────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────
export const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const prevDay = (s: string): string => {
  const d = new Date(s + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const nowStr = (): string =>
  new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ─────────────────────────────────────────────
// KPI / BONUS
// ─────────────────────────────────────────────
export const pCol = (p: number) =>
  p >= 200 ? 'var(--bl)' : p >= 100 ? 'var(--gr)' : p > 0 ? 'var(--ye)' : 'var(--mu)'

export const bnCalc = (sales: number, plan: number): number => {
  const r = plan > 0 ? sales / plan : 0
  if (r >= 2) return 12000
  if (r >= 1.5) return 7000
  if (r >= 1) return 5000
  return 0
}

// ─────────────────────────────────────────────
// DIFF COLOR
// ─────────────────────────────────────────────
export const diffCls = (d: number): string => {
  const a = Math.abs(d || 0)
  return a === 0 ? 'diff-ok' : a <= 1000 ? 'diff-warn' : 'diff-err'
}

// ─────────────────────────────────────────────
// STATUS MAP
// ─────────────────────────────────────────────
export const STATUS_MAP: Record<ReportStatus, { label: string; cls: string; ic: string }> = {
  draft_shop:  { label: 'Черновик',       cls: 'st-draft',    ic: '✏️' },
  sent_shop:   { label: 'Отправлен',      cls: 'st-sent',     ic: '📤' },
  draft_admin: { label: 'Черновик адм.',  cls: 'st-admin',    ic: '🔧' },
  sent_admin:  { label: 'На проверке',    cls: 'st-review',   ic: '🔍' },
  approved:    { label: 'Подтверждён',    cls: 'st-approved', ic: '✅' },
  rejected:    { label: 'Отклонён',       cls: 'st-rejected', ic: '❌' },
  returned:    { label: 'Возвращён',      cls: 'st-returned', ic: '↩️' },
  closed:      { label: 'Закрыт',         cls: 'st-closed',   ic: '🔒' },
}

// ─────────────────────────────────────────────
// CERTIFICATE LOGIC — новая бизнес-логика
// Группа 1: Абылайхана, Азербаева, Толе би, Косшыгулулы, Алпамыс
// Группа 2: Жургенова, Женис
// ─────────────────────────────────────────────
const GROUP1_PATTERNS = ['абылайхан', 'азербаев', 'толе би', 'косшыгулул', 'алпамыс']
const GROUP2_PATTERNS = ['жургенов', 'женис']

export const getGroupFromText = (text: string): 1 | 2 | null => {
  const lower = (text || '').toLowerCase()
  if (GROUP1_PATTERNS.some(p => lower.includes(p))) return 1
  if (GROUP2_PATTERNS.some(p => lower.includes(p))) return 2
  return null
}

export const getCertDebtType = (fromText: string, usedInGroup: 1 | 2): DebtType => {
  const soldGroup = getGroupFromText(fromText)
  if (!soldGroup) return 'no_debt'
  if (soldGroup === 1 && usedInGroup === 2) return 'debt_saken'
  if (soldGroup === 2 && usedInGroup === 1) return 'debt_aliya'
  return 'no_debt'
}

export const debtLabel = (dt: DebtType): string => {
  if (dt === 'debt_saken') return '⚠ Долг Сакена'
  if (dt === 'debt_aliya') return '⚠ Долг Алии'
  return ''
}

// ─────────────────────────────────────────────
// CSV EXPORT
// ─────────────────────────────────────────────
export const downloadCSV = (rows: (string | number)[][], filename: string) => {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
