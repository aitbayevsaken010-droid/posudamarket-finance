import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, today, STATUS_MAP, downloadCSV } from '../lib/utils'
import type { Store, DailyReport, AuditLog } from '../types'

type Tab = 'day' | 'period' | 'hist'

export default function AdminPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [date, setDate] = useState(today())
  const [reports, setReports] = useState<Record<string, DailyReport>>({})
  const [tab, setTab] = useState<Tab>('day')
  const [rangeFrom, setRangeFrom] = useState(today())
  const [rangeTo, setRangeTo] = useState(today())
  const [rangeReports, setRangeReports] = useState<DailyReport[]>([])
  const [histLogs, setHistLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)

  // Admin fill modal
  const [modal, setModal] = useState<{ store: Store; report: DailyReport | null } | null>(null)
  const [afCash, setAfCash] = useState('')
  const [afCashRet, setAfCashRet] = useState('')
  const [afKaspi, setAfKaspi] = useState('')
  const [afKaspiRet, setAfKaspiRet] = useState('')
  const [afHalyk, setAfHalyk] = useState('')
  const [afHalykRet, setAfHalykRet] = useState('')
  const [afComment, setAfComment] = useState('')
  const [afSaving, setAfSaving] = useState(false)
  const [afOk, setAfOk] = useState(false)

  useEffect(() => {
    supabase.from('stores').select('*').order('display_order').then(({ data }) => {
      if (data) setStores(data)
    })
  }, [])

  const loadDay = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('daily_reports')
      .select('*, stores(*)')
      .in('store_id', stores.map(s => s.id))
      .eq('date', date)
    const map: Record<string, DailyReport> = {}
    if (data) data.forEach((r: DailyReport) => { map[r.store_id] = r })
    setReports(map)
    setLoading(false)
  }, [stores, date])

  useEffect(() => {
    if (stores.length && tab === 'day') loadDay()
  }, [stores, date, tab, loadDay])

  async function loadRange() {
    if (!rangeFrom || !rangeTo) { alert('Укажите даты'); return }
    const { data } = await supabase
      .from('daily_reports')
      .select('*, stores(*)')
      .gte('date', rangeFrom)
      .lte('date', rangeTo)
    setRangeReports(data || [])
  }

  async function loadHist() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*, stores(name)')
      .order('created_at', { ascending: false })
      .limit(150)
    setHistLogs(data || [])
  }

  function openTab(t: Tab) {
    setTab(t)
    if (t === 'hist') loadHist()
  }

  // ─── Admin fill ─────────────────────────
  function openAdminFill(store: Store) {
    const rpt = reports[store.id] || null
    setModal({ store, report: rpt })
    const ad = rpt?.paloma_cash !== undefined ? rpt : null
    setAfCash(ad ? String(ad.paloma_cash || '') : '')
    setAfCashRet(ad ? String(ad.paloma_cash_return || '') : '')
    setAfKaspi(ad ? String(ad.paloma_kaspi || '') : '')
    setAfKaspiRet(ad ? String(ad.paloma_kaspi_return || '') : '')
    setAfHalyk(ad ? String(ad.paloma_halyk || '') : '')
    setAfHalykRet(ad ? String(ad.paloma_halyk_return || '') : '')
    setAfComment(ad ? (rpt?.admin_comment || '') : '')
    setAfOk(false)
  }

  function closeModal() {
    setModal(null)
  }

  async function saveAdminData(submit: boolean) {
    if (!modal) return
    setAfSaving(true)

    const cash = parseFloat(afCash) || 0
    const cashR = parseFloat(afCashRet) || 0
    const kaspi = parseFloat(afKaspi) || 0
    const kaspiR = parseFloat(afKaspiRet) || 0
    const halyk = parseFloat(afHalyk) || 0
    const halykR = parseFloat(afHalykRet) || 0
    const netC = Math.max(0, cash - cashR)
    const netK = Math.max(0, kaspi - kaspiR)
    const netH = Math.max(0, halyk - halykR)
    const total = netC + netK + netH
    const newStatus = submit ? 'sent_admin' : 'draft_admin'

    const payload: Partial<DailyReport> & { store_id: string; date: string } = {
      store_id: modal.store.id,
      date,
      paloma_cash: cash,
      paloma_cash_return: cashR,
      paloma_kaspi: kaspi,
      paloma_kaspi_return: kaspiR,
      paloma_halyk: halyk,
      paloma_halyk_return: halykR,
      paloma_net_cash: netC,
      paloma_net_kaspi: netK,
      paloma_net_halyk: netH,
      paloma_total: total,
      admin_comment: afComment || null,
      status: newStatus as DailyReport['status'],
      ...(submit ? { admin_submitted_at: new Date().toISOString() } : {}),
    }

    await supabase
      .from('daily_reports')
      .upsert(payload as DailyReport, { onConflict: 'store_id,date' })

    await supabase.from('audit_logs').insert({
      store_id: modal.store.id,
      report_date: date,
      role: 'admin',
      action: submit ? 'Данные администратора отправлены' : 'Черновик администратора сохранён',
      detail: `Paloma итого: ${fmt(total)}`,
    })

    setAfOk(true)
    setTimeout(async () => {
      closeModal()
      await loadDay()
    }, submit ? 1500 : 800)
    setAfSaving(false)
  }

  // ─── Computed for modal ───────────────────
  const mCash = parseFloat(afCash) || 0
  const mCashR = parseFloat(afCashRet) || 0
  const mKaspi = parseFloat(afKaspi) || 0
  const mKaspiR = parseFloat(afKaspiRet) || 0
  const mHalyk = parseFloat(afHalyk) || 0
  const mHalykR = parseFloat(afHalykRet) || 0
  const mNetC = Math.max(0, mCash - mCashR)
  const mNetK = Math.max(0, mKaspi - mKaspiR)
  const mNetH = Math.max(0, mHalyk - mHalykR)
  const mTotal = mNetC + mNetK + mNetH

  // Can admin edit?
  const canEdit = !modal?.report ||
    ['sent_shop', 'draft_admin', 'approved', 'rejected', 'returned', 'closed'].includes(modal.report.status)
  const sentToReview = modal?.report?.status === 'sent_admin'

  // ─── Summary ────────────────────────────
  const pendingInput = stores.filter(s => reports[s.id]?.status === 'sent_shop').length
  const sentReview   = stores.filter(s => reports[s.id]?.status === 'sent_admin').length
  const approved     = stores.filter(s => ['approved', 'closed'].includes(reports[s.id]?.status || '')).length

  // ─── CSV Export ─────────────────────────
  function exportDayCSV() {
    const rows: (string | number)[][] = [
      ['Магазин', 'Дата', 'Статус', 'KPI Факт', 'Paloma', 'Расхождение', 'Расходы', '%', 'Бонус']
    ]
    stores.forEach(s => {
      const r = reports[s.id]
      if (!r) { rows.push([s.name, date, 'нет отчёта', 0, 0, 0, 0, 0, 0]); return }
      const st = STATUS_MAP[r.status]
      rows.push([s.name, r.date, st.label, r.kpi_sales, r.paloma_total || 0,
        (r.kpi_sales || 0) - (r.paloma_total || 0), r.expenses_total || 0, r.pct || 0, r.bonus_total || 0])
    })
    downloadCSV(rows, `posuda_${date}.csv`)
  }

  function exportRangeCSV() {
    const rows: (string | number)[][] = [
      ['Магазин', 'Дата', 'Статус', 'KPI Факт', 'Paloma', 'Расхождение', 'Расходы', '%', 'Бонус']
    ]
    rangeReports.forEach(r => {
      const st = STATUS_MAP[r.status]
      rows.push([r.stores?.name || r.store_id, r.date, st.label, r.kpi_sales, r.paloma_total || 0,
        (r.kpi_sales || 0) - (r.paloma_total || 0), r.expenses_total || 0, r.pct || 0, r.bonus_total || 0])
    })
    downloadCSV(rows, `posuda_${rangeFrom}_${rangeTo}.csv`)
  }

  async function logout() { await supabase.auth.signOut() }

  const roleColors: Record<string, string> = {
    shop: 'var(--or)', admin: 'var(--bl)', reviewer: 'var(--pu)', cashier: 'var(--gr)'
  }
  const roleIcons: Record<string, string> = {
    shop: '🏪 Магазин', admin: '📊 Администратор', reviewer: '🔍 Проверяющий', cashier: '💰 Инкассатор'
  }

  return (
    <>
      <div className="topbar">
        <button className="btn bsm" onClick={logout}>← Выйти</button>
        <span className="tb-t">Администратор</span>
        <button className="btn bsm" onClick={loadDay}>↻</button>
      </div>

      <div className="wrap-wide">
        {/* Summary */}
        <div className="sg">
          <div className="sc"><div className="sc-l">Ждут Paloma</div><div className="sc-v" style={{ color: pendingInput > 0 ? 'var(--ye)' : 'var(--mu)' }}>{pendingInput}</div></div>
          <div className="sc"><div className="sc-l">На проверке</div><div className="sc-v" style={{ color: sentReview > 0 ? 'var(--bl)' : 'var(--mu)' }}>{sentReview}</div></div>
          <div className="sc"><div className="sc-l">Подтверждено</div><div className="sc-v" style={{ color: approved > 0 ? 'var(--gr)' : 'var(--mu)' }}>{approved}</div></div>
          <div className="sc"><div className="sc-l">Всего магазинов</div><div className="sc-v">{stores.length}</div></div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {(['day', 'period', 'hist'] as Tab[]).map(t => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => openTab(t)}>
              {t === 'day' ? 'За день' : t === 'period' ? 'Период' : 'История'}
            </button>
          ))}
        </div>

        {/* ── За день ── */}
        {tab === 'day' && (
          <div>
            <div className="fb">
              <span className="fs">Дата:</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              <button className="btn bsm" onClick={loadDay}>Обновить</button>
              <button className="btn bg2" onClick={exportDayCSV}>📥 CSV</button>
            </div>

            <div className="col-hdr" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.5fr) minmax(0,1.2fr) minmax(0,1.2fr)', padding: '0 14px 6px' }}>
              <span>Магазин</span><span>Статус</span><span></span>
            </div>

            {loading
              ? <div className="ld">Загрузка...</div>
              : stores.map(s => {
                const r = reports[s.id]
                const st = r ? STATUS_MAP[r.status] : null
                return (
                  <div key={s.id}
                    className="store-row clk"
                    style={{
                      gridTemplateColumns: 'minmax(0,2.5fr) minmax(0,1.2fr) minmax(0,1.2fr)',
                      borderColor: r?.status === 'sent_shop' ? 'rgba(255,159,90,.25)' : 'var(--b)'
                    }}
                    onClick={() => openAdminFill(s)}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--mu)', marginTop: 1 }}>план: {fmt(s.plan)}</div>
                    </div>
                    <div>{st ? <span className={`pill ${st.cls}`}>{st.ic} {st.label}</span> : <span className="pill pgr">нет отчёта</span>}</div>
                    <div style={{ fontSize: 11, color: 'var(--al)' }}>👆 заполнить Paloma</div>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* ── Период ── */}
        {tab === 'period' && (
          <div>
            <div className="fb">
              <span className="fs">С:</span><input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
              <span className="fs">по</span><input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
              <button className="btn bsm" onClick={loadRange}>Показать</button>
              <button className="btn bg2" onClick={exportRangeCSV}>📥 CSV</button>
            </div>
            {rangeReports.length === 0
              ? <div className="emp"><span className="emp-ic">📭</span>Нажмите «Показать» для загрузки</div>
              : stores.map(store => {
                const storeRpts = rangeReports.filter(r => r.store_id === store.id)
                if (!storeRpts.length) return null
                const tFact = storeRpts.reduce((a, r) => a + (r.kpi_sales || 0), 0)
                const tPal  = storeRpts.reduce((a, r) => a + (r.paloma_total || 0), 0)
                const tExp  = storeRpts.reduce((a, r) => a + (r.expenses_total || 0), 0)
                const tBon  = storeRpts.reduce((a, r) => a + (r.bonus_total || 0), 0)
                const diff  = tFact - tPal
                return (
                  <div key={store.id} className="cblk" style={{ borderColor: Math.abs(diff) > 1000 ? 'rgba(240,112,112,.25)' : 'var(--b)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{store.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--mu)' }}>{storeRpts.length} дней</div>
                      </div>
                    </div>
                    <div className="rsg">
                      <div className="rsc"><div className="l">Факт</div><div className="v" style={{ color: 'var(--al)' }}>{fmt(tFact)}</div></div>
                      <div className="rsc"><div className="l">Paloma</div><div className="v">{fmt(tPal)}</div></div>
                      <div className="rsc"><div className="l">Расх.</div><div className={`v ${diff > 0 ? 'diff-ok' : Math.abs(diff) <= 1000 ? 'diff-warn' : 'diff-err'}`}>{diff > 0 ? '+' : ''}{fmt(diff)}</div></div>
                      <div className="rsc"><div className="l">Расходы нал.</div><div className="v" style={{ color: 'var(--re)' }}>{fmt(tExp)}</div></div>
                      <div className="rsc"><div className="l">Бонус</div><div className="v" style={{ color: 'var(--gr)' }}>{fmt(tBon)}</div></div>
                    </div>
                  </div>
                )
              })
            }
          </div>
        )}

        {/* ── История ── */}
        {tab === 'hist' && (
          <div>
            {histLogs.length === 0
              ? <div className="emp"><span className="emp-ic">📋</span>История пуста</div>
              : histLogs.map(e => (
                <div key={e.id} className="hist-entry">
                  <div className="hist-hdr">
                    <span className="hist-role" style={{ color: roleColors[e.role] || 'var(--al)' }}>
                      {roleIcons[e.role] || e.role}
                    </span>
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

      {/* ── MODAL: Admin fill ── */}
      {modal && (
        <div className="mo open" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="md" style={{ maxWidth: 520 }}>
            <div className="mhd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Данные Paloma365 · {modal.store.name}</div>
                <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>
                  {date}{modal.report ? ' · ' + STATUS_MAP[modal.report.status].label : ' · нет отчёта магазина'}
                </div>
              </div>
              <button className="mx" onClick={closeModal}>✕</button>
            </div>
            <div className="mb2">
              {!modal.report && <div className="notice">Магазин ещё не сдал отчёт за эту дату.</div>}
              {sentToReview && (
                <div className="notice blue">
                  🔒 Данные отправлены на проверку. Редактирование заблокировано до решения проверяющего.
                </div>
              )}
              {modal.report && canEdit && modal.report.status !== 'sent_shop' && modal.report.status !== 'draft_admin' && (
                <div className="notice green">
                  ✅ Проверяющий принял решение: <strong>{STATUS_MAP[modal.report.status].label}</strong>. Редактирование разблокировано.
                </div>
              )}

              <div className="sd" style={{ marginTop: 0 }}>📊 Paloma365 (данные администратора)</div>
              <div className="cblk">
                <div className="row2">
                  <div className="fw"><div className="fl">Наличные (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afCash} onChange={e => setAfCash(e.target.value)} readOnly={!canEdit} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат нал. (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afCashRet} onChange={e => setAfCashRet(e.target.value)} readOnly={!canEdit} /></div></div>
                </div>
                <div className="row2">
                  <div className="fw"><div className="fl" style={{ color: 'var(--or)' }}>Kaspi (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afKaspi} onChange={e => setAfKaspi(e.target.value)} readOnly={!canEdit} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Kaspi (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afKaspiRet} onChange={e => setAfKaspiRet(e.target.value)} readOnly={!canEdit} /></div></div>
                </div>
                <div className="row2">
                  <div className="fw"><div className="fl" style={{ color: 'var(--ye)' }}>Halyk (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afHalyk} onChange={e => setAfHalyk(e.target.value)} readOnly={!canEdit} /></div></div>
                  <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Halyk (Paloma)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={afHalykRet} onChange={e => setAfHalykRet(e.target.value)} readOnly={!canEdit} /></div></div>
                </div>
                <div className="calc-row">
                  <span className="calc-lbl">Итого Paloma (нал + Kaspi + Halyk)</span>
                  <span className="calc-val">{fmt(mTotal)}</span>
                </div>
              </div>

              {mTotal > 0 && (
                <div className="cblk" style={{ marginBottom: 12 }}>
                  <div className="cblk-t">📊 Paloma365 — разбивка по каналам</div>
                  <table className="diff-tbl">
                    <thead><tr><th>Канал</th><th>Сумма</th><th>Возврат</th><th>Чистая</th></tr></thead>
                    <tbody>
                      <tr><td>Наличные</td><td>{fmt(mCash)}</td><td style={{ color: 'var(--re)' }}>{mCashR > 0 ? '−' + fmt(mCashR) : '—'}</td><td style={{ fontWeight: 600 }}>{fmt(mNetC)}</td></tr>
                      <tr><td style={{ color: 'var(--or)' }}>Kaspi</td><td>{fmt(mKaspi)}</td><td style={{ color: 'var(--re)' }}>{mKaspiR > 0 ? '−' + fmt(mKaspiR) : '—'}</td><td style={{ fontWeight: 600, color: 'var(--or)' }}>{fmt(mNetK)}</td></tr>
                      <tr><td style={{ color: 'var(--ye)' }}>Halyk</td><td>{fmt(mHalyk)}</td><td style={{ color: 'var(--re)' }}>{mHalykR > 0 ? '−' + fmt(mHalykR) : '—'}</td><td style={{ fontWeight: 600, color: 'var(--ye)' }}>{fmt(mNetH)}</td></tr>
                      <tr className="tot"><td><b>ИТОГО</b></td><td>{fmt(mCash + mKaspi + mHalyk)}</td><td style={{ color: 'var(--re)' }}>{(mCashR + mKaspiR + mHalykR) > 0 ? '−' + fmt(mCashR + mKaspiR + mHalykR) : '—'}</td><td style={{ fontWeight: 700, color: 'var(--al)' }}>{fmt(mTotal)}</td></tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="fw">
                <div className="fl">Комментарий администратора</div>
                <textarea placeholder="..." value={afComment} onChange={e => setAfComment(e.target.value)} disabled={!canEdit} />
              </div>

              {canEdit && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn bp" style={{ flex: 1 }} disabled={afSaving} onClick={() => saveAdminData(false)}>
                    💾 Сохранить черновик
                  </button>
                  <button className="btn bg2" style={{ flex: 1 }} disabled={afSaving} onClick={() => saveAdminData(true)}>
                    📤 Отправить на проверку
                  </button>
                </div>
              )}
              {afOk && <div className="om2">✓ Сохранено!</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
