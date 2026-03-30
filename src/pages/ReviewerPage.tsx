import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtS, today, diffCls, STATUS_MAP, downloadCSV, debtLabel } from '../lib/utils'
import type { Store, DailyReport, AuditLog, GiftCertificate, CashCollection } from '../types'

type MainTab = 'day' | 'period' | 'hist'
type PeriodTab = 'sverka' | 'debts' | 'inc'

export default function ReviewerPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [date, setDate] = useState(today())
  const [reports, setReports] = useState<Record<string, DailyReport>>({})
  const [mainTab, setMainTab] = useState<MainTab>('day')
  const [periodTab, setPeriodTab] = useState<PeriodTab>('sverka')
  const [rangeFrom, setRangeFrom] = useState(today())
  const [rangeTo, setRangeTo] = useState(today())
  const [rangeReports, setRangeReports] = useState<DailyReport[]>([])
  const [rangeDebts, setRangeDebts] = useState<GiftCertificate[]>([])
  const [rangeInc, setRangeInc] = useState<CashCollection[]>([])
  const [histLogs, setHistLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)

  // Reviewer modal
  const [modal, setModal] = useState<{ store: Store; report: DailyReport | null; audit: AuditLog[] } | null>(null)
  const [mrNote, setMrNote] = useState('')
  const [mrOk, setMrOk] = useState('')
  const [mrSaving, setMrSaving] = useState(false)

  // Admin edit mode inside reviewer
  const [adminEdit, setAdminEdit] = useState<{ store: Store; report: DailyReport } | null>(null)
  const [aeFields, setAeFields] = useState({ cash: '', cashR: '', kaspi: '', kaspiR: '', halyk: '', halykR: '', comment: '' })
  const [aeSaving, setAeSaving] = useState(false)
  const [aeOk, setAeOk] = useState(false)

  useEffect(() => {
    supabase.from('stores').select('*').order('display_order').then(({ data }) => {
      if (data) setStores(data)
    })
  }, [])

  const loadDay = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('*, stores(*), report_expenses(*), gift_certificates(*)')
      .eq('date', date)
    const map: Record<string, DailyReport> = {}
    if (data) data.forEach((r: DailyReport) => { map[r.store_id] = r })
    setReports(map)
    setLoading(false)
  }, [date])

  useEffect(() => {
    if (mainTab === 'day') loadDay()
  }, [date, mainTab, loadDay])

  async function loadRange() {
    if (!rangeFrom || !rangeTo) { alert('Укажите даты'); return }
    const [rptRes, certRes, incRes] = await Promise.all([
      supabase.from('daily_reports').select('*, stores(*)').gte('date', rangeFrom).lte('date', rangeTo),
      supabase.from('gift_certificates').select('*, stores(name)').gte('date', rangeFrom).lte('date', rangeTo),
      supabase.from('cash_collections').select('*, stores(name)').gte('date', rangeFrom).lte('date', rangeTo),
    ])
    setRangeReports(rptRes.data || [])
    setRangeDebts(certRes.data || [])
    setRangeInc(incRes.data || [])
  }

  async function loadHist() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, stores(name)')
      .order('created_at', { ascending: false })
      .limit(150)
    setHistLogs(data || [])
  }

  function openMainTab(t: MainTab) {
    setMainTab(t)
    if (t === 'hist') loadHist()
  }

  // ─── Open reviewer modal ────────────────
  async function openModal(store: Store) {
    const rpt = reports[store.id] || null
    let audit: AuditLog[] = []
    if (rpt) {
      const { data } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('store_id', store.id)
        .eq('report_date', date)
        .order('created_at', { ascending: false })
      audit = data || []
    }
    setModal({ store, report: rpt, audit })
    setMrNote(rpt?.reviewer_note || '')
    setMrOk('')
  }

  function closeModal() { setModal(null) }

  // ─── Reviewer action ─────────────────────
  async function reviewerAction(action: string) {
    if (!modal?.report) return
    const note = mrNote.trim()
    if ((action === 'rejected' || action === 'returned') && !note) { alert('Укажите причину'); return }
    setMrSaving(true)

    await supabase.from('daily_reports').update({
      status: action,
      reviewer_note: note || null,
      reviewer_action_at: new Date().toISOString(),
    }).eq('id', modal.report.id)

    await supabase.from('audit_logs').insert({
      store_id: modal.store.id,
      report_date: date,
      role: 'reviewer',
      action: { approved: 'Подтверждён', rejected: 'Отклонён', returned: 'Возвращён на уточнение', closed: 'Закрыт' }[action] || action,
      detail: note || null,
    })

    const labels: Record<string, string> = { approved: '✅ Подтверждено!', rejected: '❌ Отклонено', returned: '↩️ Возвращено', closed: '🔒 Закрыто' }
    setMrOk(labels[action] || 'Готово')
    setTimeout(() => { closeModal(); loadDay() }, 1500)
    setMrSaving(false)
  }

  // ─── Reviewer edit admin data ─────────────
  function openAdminEdit() {
    if (!modal?.report) return
    const r = modal.report
    setAdminEdit({ store: modal.store, report: r })
    setAeFields({
      cash:   String(r.paloma_cash || ''),
      cashR:  String(r.paloma_cash_return || ''),
      kaspi:  String(r.paloma_kaspi || ''),
      kaspiR: String(r.paloma_kaspi_return || ''),
      halyk:  String(r.paloma_halyk || ''),
      halykR: String(r.paloma_halyk_return || ''),
      comment: r.admin_comment || '',
    })
    setAeOk(false)
    closeModal()
  }

  async function saveAdminEdit(submit: boolean) {
    if (!adminEdit) return
    setAeSaving(true)
    const c = parseFloat(aeFields.cash) || 0, cr = parseFloat(aeFields.cashR) || 0
    const k = parseFloat(aeFields.kaspi) || 0, kr = parseFloat(aeFields.kaspiR) || 0
    const h = parseFloat(aeFields.halyk) || 0, hr = parseFloat(aeFields.halykR) || 0
    const nC = Math.max(0, c - cr), nK = Math.max(0, k - kr), nH = Math.max(0, h - hr)
    const total = nC + nK + nH

    await supabase.from('daily_reports').update({
      paloma_cash: c, paloma_cash_return: cr,
      paloma_kaspi: k, paloma_kaspi_return: kr,
      paloma_halyk: h, paloma_halyk_return: hr,
      paloma_net_cash: nC, paloma_net_kaspi: nK, paloma_net_halyk: nH,
      paloma_total: total,
      admin_comment: aeFields.comment || null,
      status: submit ? 'sent_admin' : 'draft_admin',
    }).eq('id', adminEdit.report.id)

    await supabase.from('audit_logs').insert({
      store_id: adminEdit.store.id,
      report_date: date,
      role: 'reviewer',
      action: 'Данные администратора отредактированы проверяющим',
      detail: `Paloma: ${fmt(total)}`,
    })

    setAeOk(true)
    setTimeout(() => { setAdminEdit(null); loadDay() }, 1500)
    setAeSaving(false)
  }

  // ─── Toggle debt paid ─────────────────────
  async function toggleDebt(cert: GiftCertificate, paid: boolean) {
    await supabase.from('gift_certificates').update({
      is_paid: paid, paid_at: paid ? new Date().toISOString() : null
    }).eq('id', cert.id!)
    await loadRange()
  }

  // ─── Summary ─────────────────────────────
  const totalFact = stores.reduce((a, s) => a + (reports[s.id]?.kpi_sales || 0), 0)
  const totalPal  = stores.reduce((a, s) => a + (reports[s.id]?.paloma_total || 0), 0)
  const approvedN  = stores.filter(s => ['approved', 'closed'].includes(reports[s.id]?.status || '')).length
  const pendingN   = stores.filter(s => ['sent_admin', 'sent_shop'].includes(reports[s.id]?.status || '')).length
  const diffCount  = stores.filter(s => {
    const r = reports[s.id]; return r && Math.abs((r.kpi_sales || 0) - (r.paloma_total || 0)) > 1000
  }).length

  const roleColors: Record<string, string> = { shop: 'var(--or)', admin: 'var(--bl)', reviewer: 'var(--pu)', cashier: 'var(--gr)' }
  const roleIcons: Record<string, string> = { shop: '🏪 Магазин', admin: '📊 Администратор', reviewer: '🔍 Проверяющий', cashier: '💰 Инкассатор' }

  async function logout() { await supabase.auth.signOut() }

  // ─── Reviewer modal render ────────────────
  const rpt = modal?.report
  const ad = rpt
  const fact = rpt?.kpi_sales || 0
  const palTot = rpt?.paloma_total || 0
  const diff = fact - palTot
  const da = Math.abs(diff)
  const isApproved = rpt?.status === 'approved' || rpt?.status === 'closed'

  return (
    <>
      <div className="topbar">
        <button className="btn bsm" onClick={logout}>← Выйти</button>
        <span className="tb-t">Проверяющий</span>
        <button className="btn bsm" onClick={loadDay}>↻</button>
      </div>

      <div className="wrap-wide">
        {/* Summary */}
        <div className="sg">
          <div className="sc"><div className="sc-l">Подтверждено</div><div className="sc-v" style={{ color: 'var(--gr)' }}>{approvedN} / {stores.length}</div></div>
          <div className="sc"><div className="sc-l">Ожидают</div><div className="sc-v" style={{ color: pendingN > 0 ? 'var(--ye)' : 'var(--mu)' }}>{pendingN}</div></div>
          <div className="sc"><div className="sc-l">Расхождений</div><div className="sc-v" style={{ color: diffCount > 0 ? 'var(--re)' : 'var(--gr)' }}>{diffCount}</div></div>
          <div className="sc"><div className="sc-l">Факт итого</div><div className="sc-v">{fmt(totalFact)}</div></div>
          <div className="sc"><div className="sc-l">Расх. итого</div><div className={`sc-v ${diffCls(totalFact - totalPal)}`}>{fmtS(totalFact - totalPal)}</div></div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {(['day', 'period', 'hist'] as MainTab[]).map(t => (
            <button key={t} className={`tab${mainTab === t ? ' active' : ''}`} onClick={() => openMainTab(t)}>
              {t === 'day' ? 'За день' : t === 'period' ? 'Период' : 'История'}
            </button>
          ))}
        </div>

        {/* ── За день ── */}
        {mainTab === 'day' && (
          <div>
            <div className="fb">
              <span className="fs">Дата:</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              <button className="btn bsm" onClick={loadDay}>Обновить</button>
              <button className="btn bg2" onClick={() => {
                const rows: (string|number)[][] = [['Магазин','Дата','Статус','Факт','Paloma','Расхождение','Расходы','%','Бонус']]
                stores.forEach(s => {
                  const r = reports[s.id]
                  if (!r) { rows.push([s.name, date, 'нет', 0,0,0,0,0,0]); return }
                  rows.push([s.name, r.date, STATUS_MAP[r.status].label, r.kpi_sales, r.paloma_total||0, (r.kpi_sales||0)-(r.paloma_total||0), r.expenses_total||0, r.pct||0, r.bonus_total||0])
                })
                downloadCSV(rows, `posuda_${date}.csv`)
              }}>📥 CSV</button>
            </div>

            <div className="col-hdr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)', padding: '0 14px 6px' }}>
              <span>Магазин</span><span>Факт</span><span>Paloma</span><span>Расхождение</span><span>Статус</span>
            </div>

            {loading ? <div className="ld">Загрузка...</div> : stores.map(s => {
              const r = reports[s.id]
              const f = r?.kpi_sales || 0, p = r?.paloma_total || 0
              const d = f - p
              const st = r ? STATUS_MAP[r.status] : null
              return (
                <div key={s.id} className="store-row clk"
                  style={{
                    gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)',
                    borderColor: r?.status === 'approved' ? 'rgba(45,212,160,.22)' : r && Math.abs(d) > 1000 ? 'rgba(240,112,112,.22)' : 'var(--b)'
                  }}
                  onClick={() => openModal(s)}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>план: {fmt(s.plan)}</div>
                  </div>
                  <div className={r ? 'sv' : 'svm'}>{r ? fmt(f) : '—'}</div>
                  <div className="sv" style={{ color: 'var(--al)' }}>{p > 0 ? fmt(p) : '—'}</div>
                  <div className={diffCls(d)}>{p > 0 ? fmtS(d) : '—'}</div>
                  <div>
                    {st ? <span className={`pill ${st.cls}`}>{st.ic} {st.label}</span> : <span className="pill pgr">нет</span>}
                    <div style={{ fontSize: 11, color: 'var(--al)', marginTop: 3 }}>👆 проверить</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Период ── */}
        {mainTab === 'period' && (
          <div>
            <div className="fb">
              <span className="fs">С:</span><input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
              <span className="fs">по</span><input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
              <button className="btn bsm" onClick={loadRange}>Показать</button>
            </div>

            <div className="tabs" style={{ marginBottom: '.75rem' }}>
              {(['sverka', 'debts', 'inc'] as PeriodTab[]).map(t => (
                <button key={t} className={`tab${periodTab === t ? ' active' : ''}`} onClick={() => setPeriodTab(t)}>
                  {t === 'sverka' ? 'Сверка' : t === 'debts' ? '⚠ Долги по сертификатам' : 'Инкассации'}
                </button>
              ))}
            </div>

            {/* Сверка */}
            {periodTab === 'sverka' && (
              <div>
                {rangeReports.length === 0
                  ? <div className="emp"><span className="emp-ic">📭</span>Нажмите «Показать»</div>
                  : (() => {
                    let tFact = 0, tPal = 0, tExp = 0, tBon = 0
                    const blocks = stores.map(store => {
                      const sr = rangeReports.filter(r => r.store_id === store.id)
                      if (!sr.length) return null
                      const sFact = sr.reduce((a, r) => a + (r.kpi_sales || 0), 0)
                      const sPal  = sr.reduce((a, r) => a + (r.paloma_total || 0), 0)
                      const sExp  = sr.reduce((a, r) => a + (r.expenses_total || 0), 0)
                      const sBon  = sr.reduce((a, r) => a + (r.bonus_total || 0), 0)
                      const diffs = sr.filter(r => Math.abs((r.kpi_sales || 0) - (r.paloma_total || 0)) > 1000).length
                      tFact += sFact; tPal += sPal; tExp += sExp; tBon += sBon
                      const diff = sFact - sPal
                      return (
                        <div key={store.id} className="cblk" style={{ borderColor: Math.abs(diff) > 1000 ? 'rgba(240,112,112,.25)' : 'var(--b)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{store.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--mu)' }}>{sr.length} дней · {rangeFrom} — {rangeTo}</div>
                            </div>
                            <span className={`pill ${diffs > 0 ? 'pr' : 'pg'}`}>{diffs > 0 ? `${diffs} расх.` : '✓ сходится'}</span>
                          </div>
                          <div className="rsg">
                            <div className="rsc"><div className="l">Факт</div><div className="v" style={{ color: 'var(--al)' }}>{fmt(sFact)}</div></div>
                            <div className="rsc"><div className="l">Paloma</div><div className="v">{fmt(sPal)}</div></div>
                            <div className={`rsc`}><div className="l">Расхождение</div><div className={`v ${diffCls(diff)}`}>{fmtS(diff)}</div></div>
                            <div className="rsc"><div className="l">Расходы нал.</div><div className="v" style={{ color: 'var(--re)' }}>{fmt(sExp)}</div></div>
                            <div className="rsc"><div className="l">Бонус</div><div className="v" style={{ color: 'var(--gr)' }}>{fmt(sBon)}</div></div>
                          </div>
                        </div>
                      )
                    })
                    return (
                      <>
                        <div className="cblk" style={{ background: 'rgba(124,111,247,.06)', borderColor: 'rgba(124,111,247,.2)', marginBottom: '.8rem' }}>
                          <div className="cblk-t">Итого за период {rangeFrom} — {rangeTo}</div>
                          <div className="rsg">
                            <div className="rsc"><div className="l">Факт всего</div><div className="v" style={{ color: 'var(--al)' }}>{fmt(tFact)}</div></div>
                            <div className="rsc"><div className="l">Paloma всего</div><div className="v">{fmt(tPal)}</div></div>
                            <div className="rsc"><div className="l">Расхождение</div><div className={`v ${diffCls(tFact - tPal)}`}>{fmtS(tFact - tPal)}</div></div>
                            <div className="rsc"><div className="l">Расходы нал.</div><div className="v" style={{ color: 'var(--re)' }}>{fmt(tExp)}</div></div>
                            <div className="rsc"><div className="l">Бонусы</div><div className="v" style={{ color: 'var(--gr)' }}>{fmt(tBon)}</div></div>
                          </div>
                          <div style={{ marginTop: 10 }}>
                            <button className="btn bg2" onClick={() => {
                              const rows: (string|number)[][] = [['Магазин','Дата','Статус','Факт','Paloma','Расхождение','Расходы','%','Бонус']]
                              rangeReports.forEach(r => rows.push([r.stores?.name||r.store_id, r.date, STATUS_MAP[r.status].label, r.kpi_sales, r.paloma_total||0, (r.kpi_sales||0)-(r.paloma_total||0), r.expenses_total||0, r.pct||0, r.bonus_total||0]))
                              downloadCSV(rows, `posuda_${rangeFrom}_${rangeTo}.csv`)
                            }}>📥 Скачать CSV за период</button>
                          </div>
                        </div>
                        {blocks}
                      </>
                    )
                  })()
                }
              </div>
            )}

            {/* Долги по сертификатам */}
            {periodTab === 'debts' && (
              <div>
                {rangeDebts.length === 0
                  ? <div className="emp"><span className="emp-ic">✅</span>Нет данных. Нажмите «Показать».</div>
                  : (() => {
                    const saken  = rangeDebts.filter(c => c.debt_type === 'debt_saken')
                    const aliya  = rangeDebts.filter(c => c.debt_type === 'debt_aliya')
                    const sakenUnpaid = saken.filter(c => !c.is_paid).reduce((a, c) => a + c.amount, 0)
                    const aliyaUnpaid = aliya.filter(c => !c.is_paid).reduce((a, c) => a + c.amount, 0)
                    const sakenPaid   = saken.filter(c => c.is_paid).reduce((a, c) => a + c.amount, 0)
                    const aliyaPaid   = aliya.filter(c => c.is_paid).reduce((a, c) => a + c.amount, 0)

                    return (
                      <>
                        <div className="sg" style={{ marginBottom: '1rem' }}>
                          <div className="sc"><div className="sc-l">Долг Сакена (не опл.)</div><div className="sc-v" style={{ color: 'var(--re)' }}>{fmt(sakenUnpaid)}</div></div>
                          <div className="sc"><div className="sc-l">Долг Алии (не опл.)</div><div className="sc-v" style={{ color: 'var(--re)' }}>{fmt(aliyaUnpaid)}</div></div>
                          <div className="sc"><div className="sc-l">Оплачено Сакен</div><div className="sc-v" style={{ color: 'var(--gr)' }}>{fmt(sakenPaid)}</div></div>
                          <div className="sc"><div className="sc-l">Оплачено Алия</div><div className="sc-v" style={{ color: 'var(--gr)' }}>{fmt(aliyaPaid)}</div></div>
                        </div>

                        {saken.length > 0 && (
                          <div className="cblk" style={{ borderColor: 'rgba(240,112,112,.3)' }}>
                            <div className="cblk-t" style={{ color: 'var(--re)' }}>⚠ Долги Сакена (продан Гр.1 → использован Гр.2)</div>
                            {saken.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((c, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--b)', fontSize: 13 }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: c.is_paid ? 'var(--mu)' : 'var(--re)' }}>{c.is_paid ? '✓ Оплачено' : '⚠ Не оплачено'} — {fmt(c.amount)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>{c.date} · от: {c.sold_store_text} → Гр.2</div>
                                  {c.comment && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{c.comment}</div>}
                                </div>
                                <button className={`btn ${c.is_paid ? 'bsm' : 'bg2'}`} style={{ fontSize: 12, padding: '5px 10px' }}
                                  onClick={() => toggleDebt(c, !c.is_paid)}>
                                  {c.is_paid ? 'Снять' : '✓ Оплачено'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {aliya.length > 0 && (
                          <div className="cblk" style={{ borderColor: 'rgba(240,112,112,.3)' }}>
                            <div className="cblk-t" style={{ color: 'var(--re)' }}>⚠ Долги Алии (продан Гр.2 → использован Гр.1)</div>
                            {aliya.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((c, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--b)', fontSize: 13 }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: c.is_paid ? 'var(--mu)' : 'var(--re)' }}>{c.is_paid ? '✓ Оплачено' : '⚠ Не оплачено'} — {fmt(c.amount)}</div>
                                  <div style={{ fontSize: 11, color: 'var(--mu)' }}>{c.date} · от: {c.sold_store_text} → Гр.1</div>
                                  {c.comment && <div style={{ fontSize: 11, color: 'var(--mu)' }}>{c.comment}</div>}
                                </div>
                                <button className={`btn ${c.is_paid ? 'bsm' : 'bg2'}`} style={{ fontSize: 12, padding: '5px 10px' }}
                                  onClick={() => toggleDebt(c, !c.is_paid)}>
                                  {c.is_paid ? 'Снять' : '✓ Оплачено'}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {saken.length === 0 && aliya.length === 0 && (
                          <div className="emp"><span className="emp-ic">✅</span>Долгов по сертификатам нет</div>
                        )}
                      </>
                    )
                  })()
                }
              </div>
            )}

            {/* Инкассации */}
            {periodTab === 'inc' && (
              <div>
                {rangeInc.length === 0
                  ? <div className="emp"><span className="emp-ic">💰</span>Нажмите «Показать»</div>
                  : (() => {
                    const tTot = rangeInc.reduce((a, i) => a + i.amount, 0)
                    return (
                      <>
                        <div className="cblk" style={{ background: 'rgba(96,180,245,.07)', borderColor: 'rgba(96,180,245,.2)', marginBottom: '.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="cblk-t">Итого инкассаций за {rangeFrom} — {rangeTo}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--bl)' }}>{fmt(tTot)}</div>
                          </div>
                        </div>
                        {stores.map(store => {
                          const list = rangeInc.filter(i => i.store_id === store.id)
                          if (!list.length) return null
                          const tot = list.reduce((a, i) => a + i.amount, 0)
                          return (
                            <div key={store.id} className="cblk">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{store.name}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bl)' }}>{fmt(tot)} · {list.length} раз</div>
                              </div>
                              {list.sort((a, b) => b.date.localeCompare(a.date)).map((r, i) => (
                                <div key={i} className="corr-row">
                                  <span style={{ color: 'var(--al)', minWidth: 80 }}>{r.date}</span>
                                  <span style={{ flex: 1, margin: '0 8px' }}>{r.collected_by || '—'}{r.collected_time ? ' · ' + r.collected_time : ''}</span>
                                  {r.note && <span style={{ fontSize: 12, color: 'var(--mu)' }}>{r.note}</span>}
                                  <span style={{ fontWeight: 700, color: 'var(--bl)' }}>{fmt(r.amount)}</span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                      </>
                    )
                  })()
                }
              </div>
            )}
          </div>
        )}

        {/* ── История ── */}
        {mainTab === 'hist' && (
          <div>
            {histLogs.length === 0
              ? <div className="emp"><span className="emp-ic">📋</span>История пуста</div>
              : histLogs.map(e => (
                <div key={e.id} className="hist-entry">
                  <div className="hist-hdr">
                    <span className="hist-role" style={{ color: roleColors[e.role] || 'var(--al)' }}>{roleIcons[e.role] || e.role}</span>
                    <span className="hist-time">{new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="hist-action">{(e.stores as Store | undefined)?.name || ''} · {e.report_date}</div>
                  <div className="hist-detail">{e.action}{e.detail ? ' — ' + e.detail : ''}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* ══ MODAL: Reviewer ══ */}
      {modal && (
        <div className="mo open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="md" style={{ maxWidth: 740 }}>
            <div className="mhd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Проверка: {modal.store.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>
                  {date}{rpt ? ' · ' + STATUS_MAP[rpt.status].label : ' · нет отчёта'}
                </div>
              </div>
              <button className="mx" onClick={closeModal}>✕</button>
            </div>
            <div className="mb2">
              {!rpt
                ? <div className="emp"><span className="emp-ic">📭</span>Магазин не сдал отчёт за эту дату.</div>
                : <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {rpt.status && <span className={`pill ${STATUS_MAP[rpt.status].cls}`}>{STATUS_MAP[rpt.status].ic} {STATUS_MAP[rpt.status].label}</span>}
                    {rpt.submitted_at && <span style={{ fontSize: 12, color: 'var(--mu)' }}>Магазин: {new Date(rpt.submitted_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    {rpt.admin_submitted_at && <span style={{ fontSize: 12, color: 'var(--mu)' }}>Админ: {new Date(rpt.admin_submitted_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>

                  {/* Comparison */}
                  <div className="cmp">
                    <div className="cmp-col">
                      <div className="cmp-col-t" style={{ color: 'var(--or)' }}>🏪 Магазин</div>
                      <div className="cmp-row"><span className="cmp-lbl">Нал. (чист.)</span><span className="cmp-val">{fmt(rpt.cash_rev)}</span></div>
                      <div className="cmp-row"><span className="cmp-lbl">Возврат нал.</span><span className="cmp-val" style={{ color: 'var(--re)' }}>{fmt(rpt.cash_return)}</span></div>
                      {(rpt.kaspi_change || 0) > 0 && <div className="cmp-row" style={{ background: 'var(--ob)', borderRadius: 6, padding: '4px 8px' }}><span className="cmp-lbl" style={{ color: 'var(--or)' }}>🟠 Kaspi-сдача</span><span className="cmp-val" style={{ color: 'var(--or)' }}>−{fmt(rpt.kaspi_change)}</span></div>}
                      {(rpt.expenses_total || 0) > 0 && <div className="cmp-row"><span className="cmp-lbl" style={{ color: 'var(--re)' }}>Расходы нал.</span><span className="cmp-val" style={{ color: 'var(--re)' }}>−{fmt(rpt.expenses_total)}</span></div>}
                      <div className="cmp-row"><span className="cmp-lbl" style={{ color: 'var(--or)' }}>Kaspi (чист.)</span><span className="cmp-val" style={{ color: 'var(--or)' }}>{fmt(rpt.net_kaspi)}</span></div>
                      <div className="cmp-row"><span className="cmp-lbl" style={{ color: 'var(--ye)' }}>Halyk (чист.)</span><span className="cmp-val" style={{ color: 'var(--ye)' }}>{fmt(rpt.net_halyk)}</span></div>
                      <div className="cmp-row" style={{ borderTop: '2px solid var(--b2)', marginTop: 4, paddingTop: 8 }}>
                        <span className="cmp-lbl" style={{ fontWeight: 600 }}>KPI Факт</span>
                        <span className="cmp-val" style={{ color: 'var(--al)', fontSize: 16 }}>{fmt(fact)}</span>
                      </div>
                    </div>
                    <div className="cmp-col">
                      <div className="cmp-col-t" style={{ color: 'var(--bl)' }}>📊 Paloma (адм.)</div>
                      {ad && palTot > 0 ? <>
                        <div className="cmp-row"><span className="cmp-lbl">Нал. (чист.)</span><span className="cmp-val">{fmt(rpt.paloma_net_cash)}</span></div>
                        <div className="cmp-row"><span className="cmp-lbl">Возврат нал.</span><span className="cmp-val" style={{ color: 'var(--re)' }}>{fmt(rpt.paloma_cash_return)}</span></div>
                        <div className="cmp-row"><span className="cmp-lbl" style={{ color: 'var(--or)' }}>Kaspi (чист.)</span><span className="cmp-val" style={{ color: 'var(--or)' }}>{fmt(rpt.paloma_net_kaspi)}</span></div>
                        <div className="cmp-row"><span className="cmp-lbl" style={{ color: 'var(--ye)' }}>Halyk (чист.)</span><span className="cmp-val" style={{ color: 'var(--ye)' }}>{fmt(rpt.paloma_net_halyk)}</span></div>
                        <div className="cmp-row" style={{ borderTop: '2px solid var(--b2)', marginTop: 4, paddingTop: 8 }}>
                          <span className="cmp-lbl" style={{ fontWeight: 600 }}>Paloma Итого</span>
                          <span className="cmp-val" style={{ color: 'var(--al)', fontSize: 16 }}>{fmt(palTot)}</span>
                        </div>
                      </> : <div style={{ fontSize: 13, color: 'var(--mu)', padding: '1rem 0' }}>Администратор ещё не заполнил данные.</div>}
                    </div>
                  </div>

                  {/* Diff banner */}
                  {palTot > 0 && (
                    <div style={{ background: da === 0 ? 'var(--gb)' : da <= 1000 ? 'var(--yb)' : 'var(--rb)', borderRadius: 11, padding: '11px 14px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: da === 0 ? 'var(--gr)' : da <= 1000 ? 'var(--ye)' : 'var(--re)' }}>
                          {da === 0 ? '✓ Совпадает!' : da <= 1000 ? '⚠ Небольшое расхождение' : '✗ Расхождение!'}
                        </div>
                        <div style={{ fontSize: 12, opacity: .8, color: da === 0 ? 'var(--gr)' : da <= 1000 ? 'var(--ye)' : 'var(--re)' }}>
                          {da === 0 ? 'Все каналы сходятся' : (diff > 0 ? 'Факт больше Paloma' : 'Paloma больше Факта') + ' на ' + fmt(da)}
                        </div>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: da === 0 ? 'var(--gr)' : da <= 1000 ? 'var(--ye)' : 'var(--re)' }}>{fmtS(diff)}</div>
                    </div>
                  )}

                  {/* Diff table */}
                  <table className="diff-tbl" style={{ marginBottom: '1rem' }}>
                    <thead><tr><th>Канал</th><th>Факт</th><th>Paloma</th><th>Расх.</th></tr></thead>
                    <tbody>
                      {[
                        { l: 'Наличные', f: rpt.cash_rev, p: rpt.paloma_net_cash, c: 'var(--tx)' },
                        { l: 'Kaspi',    f: rpt.net_kaspi, p: rpt.paloma_net_kaspi, c: 'var(--or)' },
                        { l: 'Halyk',   f: rpt.net_halyk, p: rpt.paloma_net_halyk, c: 'var(--ye)' },
                        { l: 'ИТОГО',   f: fact, p: palTot, c: 'var(--al)', tot: true },
                      ].map((row, i) => {
                        const d = row.f - row.p
                        return (
                          <tr key={i} className={row.tot ? 'tot' : ''}>
                            <td style={{ color: row.c }}>{row.tot ? <b>{row.l}</b> : row.l}</td>
                            <td style={{ fontWeight: 600, color: row.c }}>{fmt(row.f)}</td>
                            <td style={{ color: 'var(--al)' }}>{palTot > 0 || row.tot ? fmt(row.p) : '—'}</td>
                            <td className={palTot > 0 ? diffCls(d) : 'diff-ok'}>{palTot > 0 ? fmtS(d) : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {/* Certs */}
                  {rpt.gift_certificates && rpt.gift_certificates.length > 0 && (
                    <div className="ms">
                      <div className="ms-t">🎓 Сертификаты ({rpt.gift_certificates.length})</div>
                      {rpt.gift_certificates.map((c, i) => {
                        const dl = debtLabel(c.debt_type)
                        return (
                          <div key={i} className="cert-entry" style={{ borderColor: dl ? 'var(--re)' : undefined, marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600, color: dl ? 'var(--re)' : 'var(--pu)' }}>{fmt(c.amount)}</span>
                              {dl ? <span className="pill pr" style={{ fontSize: 10 }}>{dl}</span> : <span className="pill ppu" style={{ fontSize: 10 }}>серт.</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--mu)' }}>От: {c.sold_store_text || '—'}{c.comment ? ' · ' + c.comment : ''}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Expenses */}
                  {rpt.report_expenses && rpt.report_expenses.length > 0 && (
                    <div className="ms">
                      <div className="ms-t" style={{ color: 'var(--re)' }}>💸 Расходы наличными</div>
                      {rpt.report_expenses.map((e, i) => (
                        <div key={i} className="cmp-row">
                          <span className="cmp-lbl">{e.name}</span>
                          <span className="cmp-val" style={{ color: 'var(--re)' }}>−{fmt(e.amount)}</span>
                        </div>
                      ))}
                      <div className="cmp-row" style={{ borderTop: '2px solid var(--b2)', marginTop: 4, paddingTop: 6 }}>
                        <span className="cmp-lbl" style={{ fontWeight: 600 }}>Итого расходы</span>
                        <span className="cmp-val" style={{ color: 'var(--re)', fontSize: 15 }}>−{fmt(rpt.expenses_total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Action */}
                  <div className="ms">
                    <div className="ms-t">Действие проверяющего</div>
                    {isApproved && (
                      <div className="notice green" style={{ marginBottom: 8 }}>
                        ✅ Отчёт уже подтверждён{rpt.reviewer_note ? ' · ' + rpt.reviewer_note : ''}. Можно изменить при необходимости.
                      </div>
                    )}
                    {!isApproved && (
                      <div className="fw">
                        <div className="fl">Комментарий (обязателен при отклонении/возврате)</div>
                        <textarea placeholder="Причина / пояснение..." value={mrNote} onChange={e => setMrNote(e.target.value)} />
                      </div>
                    )}
                    {isApproved && (
                      <div className="fw">
                        <div className="fl">Комментарий</div>
                        <textarea placeholder="Причина / пояснение..." value={mrNote} onChange={e => setMrNote(e.target.value)} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {!isApproved && <button className="btn bg2" disabled={mrSaving} onClick={() => reviewerAction('approved')} style={{ flex: 1 }}>✅ Подтвердить</button>}
                      <button className="btn bd" disabled={mrSaving} onClick={() => reviewerAction('rejected')}>❌ Отклонить</button>
                      <button className="btn bw" disabled={mrSaving} onClick={() => reviewerAction('returned')}>↩️ Вернуть</button>
                      <button className="btn bsm" disabled={mrSaving} onClick={() => reviewerAction('closed')}>🔒 Закрыть</button>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button className="btn bpu bb2" onClick={openAdminEdit}>✎ Редактировать данные Paloma</button>
                    </div>
                  </div>

                  {/* Audit */}
                  {modal.audit.length > 0 && (
                    <div className="ms">
                      <div className="ms-t">📋 История изменений</div>
                      {modal.audit.slice(0, 10).map(e => (
                        <div key={e.id} className="hist-entry">
                          <div className="hist-hdr">
                            <span className="hist-role" style={{ fontSize: 11, color: roleColors[e.role] || 'var(--al)' }}>{e.role}</span>
                            <span className="hist-time">{new Date(e.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="hist-detail">{e.action}{e.detail ? ' — ' + e.detail : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {mrOk && <div className="om2">{mrOk}</div>}
                </>
              }
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Admin edit by reviewer ══ */}
      {adminEdit && (
        <div className="mo open" onClick={e => e.target === e.currentTarget && setAdminEdit(null)}>
          <div className="md" style={{ maxWidth: 520 }}>
            <div className="mhd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Редактировать Paloma: {adminEdit.store.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>{date}</div>
              </div>
              <button className="mx" onClick={() => setAdminEdit(null)}>✕</button>
            </div>
            <div className="mb2">
              <div className="notice pu">✎ Редактирование от имени проверяющего. Действие будет записано в историю.</div>
              <div className="cblk">
                <div className="row2">
                  <div className="fw"><div className="fl">Наличные (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.cash} onChange={e => setAeFields(p => ({ ...p, cash: e.target.value }))} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат нал.</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.cashR} onChange={e => setAeFields(p => ({ ...p, cashR: e.target.value }))} /></div></div>
                </div>
                <div className="row2">
                  <div className="fw"><div className="fl" style={{ color: 'var(--or)' }}>Kaspi (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.kaspi} onChange={e => setAeFields(p => ({ ...p, kaspi: e.target.value }))} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Kaspi</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.kaspiR} onChange={e => setAeFields(p => ({ ...p, kaspiR: e.target.value }))} /></div></div>
                </div>
                <div className="row2">
                  <div className="fw"><div className="fl" style={{ color: 'var(--ye)' }}>Halyk (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.halyk} onChange={e => setAeFields(p => ({ ...p, halyk: e.target.value }))} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Halyk</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={aeFields.halykR} onChange={e => setAeFields(p => ({ ...p, halykR: e.target.value }))} /></div></div>
                </div>
              </div>
              <div className="fw">
                <div className="fl">Комментарий</div>
                <textarea placeholder="..." value={aeFields.comment} onChange={e => setAeFields(p => ({ ...p, comment: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn bp" style={{ flex: 1 }} disabled={aeSaving} onClick={() => saveAdminEdit(false)}>💾 Сохранить черновик</button>
                <button className="btn bg2" style={{ flex: 1 }} disabled={aeSaving} onClick={() => saveAdminEdit(true)}>📤 Отправить на проверку</button>
              </div>
              {aeOk && <div className="om2">✓ Сохранено!</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
