export type Role = 'shop' | 'admin' | 'reviewer' | 'cashier'

export type ReportStatus =
  | 'draft_shop'
  | 'sent_shop'
  | 'draft_admin'
  | 'sent_admin'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'closed'

export type DebtType = 'debt_saken' | 'debt_aliya' | 'no_debt'

export interface Store {
  id: string
  slug: string
  name: string
  plan: number
  default_emp: number
  store_group: 1 | 2
  display_order: number
}

export interface UserProfile {
  id: string
  role: Role
  store_id: string | null
  display_name: string | null
}

export interface DailyReport {
  id: string
  store_id: string
  date: string
  status: ReportStatus
  emp: number
  start_cash: number
  end_cash: number
  cash_return: number
  kaspi_change: number
  kaspi: number
  kaspi_return: number
  halyk: number
  halyk_return: number
  shop_comment: string | null
  cash_rev: number
  net_kaspi: number
  net_halyk: number
  kpi_sales: number
  pct: number
  bonus_per: number
  bonus_total: number
  expenses_total: number
  certs_total: number
  incassated_total: number
  effective_end_cash: number
  submitted_at: string | null
  paloma_cash: number
  paloma_cash_return: number
  paloma_kaspi: number
  paloma_kaspi_return: number
  paloma_halyk: number
  paloma_halyk_return: number
  paloma_net_cash: number
  paloma_net_kaspi: number
  paloma_net_halyk: number
  paloma_total: number
  admin_comment: string | null
  admin_submitted_at: string | null
  reviewer_note: string | null
  reviewer_action_at: string | null
  created_at: string
  updated_at: string
  stores?: Store
  report_expenses?: Expense[]
  gift_certificates?: GiftCertificate[]
}

export interface Expense {
  id?: string
  report_id?: string
  name: string
  amount: number
}

export interface GiftCertificate {
  id?: string
  report_id?: string
  store_id?: string
  date?: string
  sold_store_text: string
  sold_store_group: 1 | 2 | null
  used_store_group?: 1 | 2
  amount: number
  comment: string
  debt_type: DebtType
  is_paid: boolean
  paid_at?: string | null
}

export interface CashCollection {
  id: string
  store_id: string
  date: string
  amount: number
  collected_by: string | null
  collected_time: string | null
  note: string | null
  created_at: string
  stores?: Store
}

export interface AuditLog {
  id: string
  store_id: string
  report_date: string
  role: string
  action: string
  detail: string | null
  created_at: string
  stores?: Store
}
