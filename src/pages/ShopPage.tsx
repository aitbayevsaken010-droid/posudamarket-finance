import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  fmt, fmtS, today, prevDay, pCol, bnCalc, diffCls,
  STATUS_MAP, getCertDebtType, getGroupFromText, debtLabel, downloadCSV
} from '../lib/utils'
import type { Store, DailyReport, Expense, GiftCertificate } from '../types'

interface Props { storeId: string }

interface CertForm {
  key: number
  from: string
  amount: string
  comment: string
}

interface ExpForm {
  key: number
  name: string
  amount: string
}

let _certKey = 0
let _expKey = 0

export default function ShopPage({ storeId }: Props) {
  const [store, setStore] = useState<Store | null>(null)
  const [report, setReport] = useState<DailyReport | null>(null)
  const [prevEffective, setPrevEffective] = useState(0)
  const [prevIncTotal, setPrevIncTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitOk, setSubmitOk] = useState(false)

  // Form state
  const [startCash, setStartCash] = useState('')
  const [endCash, setEndCash] = useState('')
  const [cashReturn, setCashReturn] = useState('')
  const [kaspiChange, setKaspiChange] = useState('')
  const [kaspi, setKaspi] = useState('')
  const [kaspiReturn, setKaspiReturn] = useState('')
  const [halyk, setHalyk] = useState('')
  const [halykReturn, setHalykReturn] = useState('')
  const [emp, setEmp] = useState('2')
  const [comment, setComment] = useState('')
  const [expenses, setExpenses] = useState<ExpForm[]>([])
  const [certs, setCerts] = useState<CertForm[]>([])

  const date = today()

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: storeData }, { data: rptData }] = await Promise.all([
      supabase.from('stores').select('*').eq('id', storeId).single(),
      supabase
        .from('daily_reports')
        .select('*, report_expenses(*), gift_certificates(*)')
        .eq('store_id', storeId)
        .eq('date', date)
        .maybeSingle(),
    ])
    if (storeData) setStore(storeData)

    // Previous day effective
    const pd = prevDay(date)
    const { data: prevData } = await supabase
      .from('daily_reports')
      .select('effective_end_cash, incassated_total')
      .eq('store_id', storeId)
      .eq('date', pd)
      .maybeSingle()
    const effPrev = prevData?.effective_end_cash ?? 0
    const incPrev = prevData?.incassated_total ?? 0
    setPrevEffective(effPrev)
    setPrevIncTotal(incPrev)

    if (rptData) {
      setReport(rptData)
      // Pre-fill form only if editable (draft or returned)
      if (rptData.status === 'draft_shop' || rptData.status === 'returned') {
        setStartCash(String(rptData.start_cash || effPrev || 0))
        setEndCash(String(rptData.end_cash || ''))
        setCashReturn(String(rptData.cash_return || ''))
        setKaspiChange(String(rptData.kaspi_change || ''))
        setKaspi(String(rptData.kaspi || ''))
        setKaspiReturn(String(rptData.kaspi_return || ''))
        setHalyk(String(rptData.halyk || ''))
        setHalykReturn(String(rptData.halyk_return || ''))
        setEmp(String(rptData.emp || storeData?.default_emp || 2))
        setComment(rptData.shop_comment || '')
        setExpenses((rptData.report_expenses || []).map((e: Expense) => ({
          key: ++_expKey, name: e.name, amount: String(e.amount)
        })))
        setCerts((rptData.gift_certificates || []).map((c: GiftCertificate) => ({
          key: ++_certKey, from: c.sold_store_text || '', amount: String(c.amount), comment: c.comment || ''
        })))
      }
    } else {
      // New report defaults
      setStartCash(String(effPrev || 0))
      setEmp(String(storeData?.default_emp || 2))
    }
    setLoading(false)
  }, [storeId, date])

  useEffect(() => { load() }, [load])

  // ─── COMPUTED ─────────────────────────────
  const sc = parseFloat(startCash) || 0
  const ec = parseFloat(endCash) || 0
  const cr = parseFloat(cashReturn) || 0
  const kc = parseFloat(kaspiChange) || 0
  const kp = parseFloat(kaspi) || 0
  const kr = parseFloat(kaspiReturn) || 0
  const hl = parseFloat(halyk) || 0
  const hr = parseFloat(halykReturn) || 0
  const expTotal = expenses.reduce((a, e) => a + (parseFloat(e.amount) || 0), 0)
  const netKaspi = Math.max(0, kp - kr)
  const netHalyk = Math.max(0, hl - hr)
  const cashRev = Math.max(0, ec - sc - cr - expTotal)
  const kpiSales = cashRev + netKaspi + netHalyk
  const empN = parseInt(emp) || 1
  const pct = store ? Math.round((kpiSales / store.plan) * 100) : 0
  const bonPer = store ? bnCalc(kpiSales, store.plan) : 0
  const bonTotal = bonPer * empN
  const certsTotal = certs.reduce((a, c) => a + (parseFloat(c.amount) || 0), 0)
  const incassated = report?.incassated_total || 0
  const effectiveEnd = Math.max(0, ec - incassated - kc)

  // ─── SUBMIT ───────────────────────────────
  async function handleSubmit() {
    if (!ec && !kp && !hl) { alert('Введите хотя бы одну сумму'); return }
    if (!store) return
    setSubmitting(true)

    const reportPayload = {
      store_id: storeId,
      date,
      status: 'sent_shop' as const,
      emp: empN,
      start_cash: sc,
      end_cash: ec,
      cash_return: cr,
      kaspi_change: kc,
      kaspi: kp,
      kaspi_return: kr,
      halyk: hl,
      halyk_return: hr,
      shop_comment: comment || null,
      cash_rev: cashRev,
      net_kaspi: netKaspi,
      net_halyk: netHalyk,
      kpi_sales: kpiSales,
      pct,
      bonus_per: bonPer,
      bonus_total: bonTotal,
      expenses_total: expTotal,
      certs_total: certsTotal,
      incassated_total: incassated,
      effective_end_cash: effectiveEnd,
      submitted_at: new Date().toISOString(),
    }

    // Upsert report
    const { data: saved, error: rErr } = await supabase
      .from('daily_reports')
      .upsert(reportPayload, { onConflict: 'store_id,date' })
      .select()
      .single()

    if (rErr || !saved) { alert('Ошибка сохранения: ' + rErr?.message); setSubmitting(false); return }

    const reportId = saved.id

    // Save expenses
    await supabase.from('report_expenses').delete().eq('report_id', reportId)
    const validExp = expenses.filter(e => parseFloat(e.amount) > 0)
    if (validExp.length) {
      await supabase.from('report_expenses').insert(
        validExp.map(e => ({ report_id: reportId, name: e.name || 'Расход', amount: parseFloat(e.amount) }))
      )
    }

    // Save certificates with new debt logic
    await supabase.from('gift_certificates').delete().eq('report_id', reportId)
    const validCerts = certs.filter(c => parseFloat(c.amount) > 0 || c.from)
    if (validCerts.length && store) {
      await supabase.from('gift_certificates').insert(
        validCerts.map(c => {
          const soldGroup = getGroupFromText(c.from)
          const debtType = getCertDebtType(c.from, store.store_group)
          return {
            report_id: reportId,
            store_id: storeId,
            date,
            sold_store_text: c.from,
            sold_store_group: soldGroup,
            used_store_group: store.store_group,
            amount: parseFloat(c.amount) || 0,
            comment: c.comment || null,
            debt_type: debtType,
            is_paid: false,
          }
        })
      )
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      store_id: storeId,
      report_date: date,
      role: 'shop',
      action: 'Отчёт отправлен магазином',
      detail: `KPI: ${fmt(kpiSales)}, статус: sent_shop`,
    })

    setSubmitOk(true)
    setTimeout(() => { setSubmitOk(false); load() }, 2000)
    setSubmitting(false)
  }

  function addExp() {
    setExpenses(prev => [...prev, { key: ++_expKey, name: '', amount: '' }])
  }
  function removeExp(key: number) {
    setExpenses(prev => prev.filter(e => e.key !== key))
  }
  function updateExp(key: number, field: 'name' | 'amount', val: string) {
    setExpenses(prev => prev.map(e => e.key === key ? { ...e, [field]: val } : e))
  }

  function addCert() {
    setCerts(prev => [...prev, { key: ++_certKey, from: '', amount: '', comment: '' }])
  }
  function removeCert(key: number) {
    setCerts(prev => prev.filter(c => c.key !== key))
  }
  function updateCert(key: number, field: keyof CertForm, val: string) {
    setCerts(prev => prev.map(c => c.key === key ? { ...c, [field]: val } : c))
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  if (loading) return <div className="ld">Загрузка...</div>
  if (!store) return <div className="ld">Магазин не найден</div>

  const st = report ? STATUS_MAP[report.status] : null

  // ─── LOCKED VIEW ──────────────────────────
  if (report && report.status !== 'returned' && report.status !== 'draft_shop') {
    return (
      <>
        <div className="topbar">
          <button className="btn bsm" onClick={logout}>← Выйти</button>
          <span className="tb-t">{store.name}</span>
          {st && <span className={`pill ${st.cls}`}>{st.ic} {st.label}</span>}
        </div>
        <div className="wrap">
          <div className="stbdg">
            <div className="stbdg-ic">🏪</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{store.name}</div>
              <div style={{ fontSize: 12, color: 'var(--mu)' }}>{date}</div>
            </div>
            {st && <span className={`pill ${st.cls}`}>{st.ic} {st.label}</span>}
          </div>

          {report.status === 'approved' && <div className="notice green">✅ Ваш отчёт подтверждён проверяющим.</div>}
          {report.status === 'rejected' && <div className="notice red">❌ Отчёт отклонён. {report.reviewer_note && <small>{report.reviewer_note}</small>}</div>}
          {report.status === 'closed'   && <div className="notice" style={{ color: 'var(--mu)' }}>🔒 Отчёт закрыт.</div>}

          <div className="sg">
            <div className="sc"><div className="sc-l">KPI Выручка</div><div className="sc-v" style={{ color: 'var(--al)' }}>{fmt(report.kpi_sales)}</div></div>
            <div className="sc"><div className="sc-l">Выполнение</div><div className="sc-v" style={{ color: pCol(report.pct) }}>{report.pct}%</div></div>
            <div className="sc"><div className="sc-l">Бонус итого</div><div className="sc-v" style={{ color: 'var(--gr)' }}>{fmt(report.bonus_total)}</div></div>
          </div>

          <div className="cblk">
            <div className="cblk-t">💵 Наличные</div>
            <div className="mg3">
              <div className="mc"><div className="mc-l">Начало дня</div><div className="mc-v">{fmt(report.start_cash)}</div></div>
              <div className="mc"><div className="mc-l">Конец дня</div><div className="mc-v" style={{ color: 'var(--ye)' }}>{fmt(report.end_cash)}</div></div>
              <div className="mc"><div className="mc-l">Возврат нал.</div><div className="mc-v" style={{ color: 'var(--re)' }}>{fmt(report.cash_return)}</div></div>
            </div>
            {report.kaspi_change > 0 && (
              <div style={{ background: 'var(--ob)', border: '1px solid rgba(255,159,90,.3)', borderRadius: 8, padding: '8px 11px', marginTop: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--or)', fontWeight: 600 }}>🟠 Kaspi-сдача (излишек)</span>
                  <span style={{ color: 'var(--or)', fontWeight: 700 }}>−{fmt(report.kaspi_change)}</span>
                </div>
              </div>
            )}
            {report.expenses_total > 0 && report.report_expenses && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>💸 Расходы</div>
                {report.report_expenses.map((e, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                    <span style={{ color: 'var(--mu)' }}>{e.name}</span>
                    <span style={{ color: 'var(--re)', fontWeight: 600 }}>−{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mtr"><span>Чистая выручка нал.</span><span style={{ color: 'var(--gr)', fontSize: 16, fontWeight: 700 }}>{fmt(report.cash_rev)}</span></div>
          </div>

          <div className="cblk">
            <div className="cblk-t">💳 Терминал</div>
            <div className="mg2">
              <div className="mc"><div className="mc-l" style={{ color: 'var(--or)' }}>Kaspi</div><div className="mc-v" style={{ color: 'var(--or)' }}>{fmt(report.kaspi)}</div></div>
              <div className="mc"><div className="mc-l" style={{ color: 'var(--re)' }}>Возврат Kaspi</div><div className="mc-v" style={{ color: 'var(--re)' }}>{fmt(report.kaspi_return)}</div></div>
              <div className="mc"><div className="mc-l" style={{ color: 'var(--ye)' }}>Halyk</div><div className="mc-v" style={{ color: 'var(--ye)' }}>{fmt(report.halyk)}</div></div>
              <div className="mc"><div className="mc-l" style={{ color: 'var(--re)' }}>Возврат Halyk</div><div className="mc-v" style={{ color: 'var(--re)' }}>{fmt(report.halyk_return)}</div></div>
            </div>
          </div>

          {report.gift_certificates && report.gift_certificates.length > 0 && (
            <div className="cblk">
              <div className="cblk-t">🎓 Сертификаты ({report.gift_certificates.length} шт.)</div>
              {report.gift_certificates.map((c, i) => {
                const dl = debtLabel(c.debt_type)
                return (
                  <div key={i} className="cert-entry" style={{ borderColor: dl ? 'var(--re)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, color: dl ? 'var(--re)' : 'var(--pu)' }}>{fmt(c.amount)}</span>
                      {dl
                        ? <span className="pill pr" style={{ fontSize: 10 }}>{dl} {c.is_paid ? '✓ оплачено' : 'не оплачено'}</span>
                        : <span className="pill ppu" style={{ fontSize: 10 }}>сертификат</span>
                      }
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 3 }}>Откуда: {c.sold_store_text || '—'}</div>
                    {c.comment && <div style={{ fontSize: 12, color: 'var(--mu)' }}>{c.comment}</div>}
                  </div>
                )
              })}
            </div>
          )}

          {report.shop_comment && (
            <div className="cblk"><div className="cblk-t">Комментарий</div><div style={{ fontSize: 13 }}>{report.shop_comment}</div></div>
          )}

          <div className="cblk" style={{ background: 'rgba(45,212,160,.04)', borderColor: 'rgba(45,212,160,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--mu)' }}>Остаток на начало завтра</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--gr)' }}>{fmt(report.effective_end_cash)}</span>
            </div>
            {report.incassated_total > 0 && (
              <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 6 }}>
                Инкассировано: −{fmt(report.incassated_total)} / Касса конец: {fmt(report.end_cash)}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // ─── FORM VIEW ────────────────────────────
  const isReturn = report?.status === 'returned'

  return (
    <>
      <div className="topbar">
        <button className="btn bsm" onClick={logout}>← Выйти</button>
        <span className="tb-t">{store.name}</span>
      </div>
      <div className="wrap">
        <div className="stbdg">
          <div className="stbdg-ic">🏪</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{store.name}</div>
            <div style={{ fontSize: 12, color: 'var(--mu)' }}>Дата: {date} · план: {fmt(store.plan)}</div>
          </div>
        </div>

        {isReturn && <div className="notice">↩️ Возвращён на уточнение: {report?.reviewer_note || '—'}</div>}

        {/* ── Шаг 1: Наличные ── */}
        <div className="sd">Шаг 1 · 💵 Наличные</div>
        <div className="cblk">
          <div className="fw">
            <div className="fl">
              Начало дня (сдача)
              {prevEffective > 0 && !report && (
                <span style={{ color: 'var(--al)', fontSize: 11 }}>
                  {prevIncTotal > 0
                    ? ` · перенесено с вчера (${fmt(prevEffective)} после инкассации)`
                    : ` · перенесено с вчера: ${fmt(prevEffective)}`}
                </span>
              )}
            </div>
            <div className="mi">
              <input type="number" min="0" step="100" placeholder="0"
                value={startCash} onChange={e => setStartCash(e.target.value)} />
            </div>
          </div>
          <div className="fw">
            <div className="fl">Конец дня (итоговая касса)</div>
            <div className="mi"><input type="number" min="0" step="100" placeholder="0" value={endCash} onChange={e => setEndCash(e.target.value)} /></div>
          </div>
          <div className="fw">
            <div className="fl">Возврат наличными</div>
            <div className="mi"><input type="number" min="0" step="100" placeholder="0" value={cashReturn} onChange={e => setCashReturn(e.target.value)} /></div>
          </div>
          <div className="fw">
            <div className="fl" style={{ color: 'var(--or)' }}>Kaspi-сдача <span style={{ fontWeight: 400, color: 'var(--mu)' }}>— бухгалтер перевёл сдачу клиенту через Kaspi</span></div>
            <div className="mi"><input type="number" min="0" step="100" placeholder="0" value={kaspiChange} onChange={e => setKaspiChange(e.target.value)} /></div>
            {kc > 0 && (
              <div style={{ fontSize: 12, color: 'var(--or)', marginTop: 5, background: 'var(--ob)', borderRadius: 8, padding: '7px 10px', lineHeight: 1.5 }}>
                ℹ️ Эта сумма — излишек наличных. Она уйдёт из остатка кассы на следующий день.
              </div>
            )}
          </div>
          {(ec > 0 || cr > 0 || expTotal > 0) && (
            <div className="calc-row">
              <span className="calc-lbl">Чистая нал. выручка</span>
              <span className="calc-val">{fmt(cashRev)}{kc > 0 ? ` (сдача: −${fmt(kc)})` : ''}</span>
            </div>
          )}
        </div>

        {/* ── Шаг 2: Расходы ── */}
        <div className="sd">
          Шаг 2 · 💸 Расходы наличными <span className="pill pgr" style={{ fontSize: 10, verticalAlign: 'middle' }}>необязательно</span>
        </div>
        <div className="cblk">
          <div style={{ fontSize: 12, color: 'var(--mu)', marginBottom: 10 }}>Любые траты из кассы: закупки, хоз. расходы, зарплата...</div>
          {expenses.map(e => (
            <div key={e.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 7 }}>
              <input type="text" placeholder="Название расхода" value={e.name} style={{ flex: 2 }}
                onChange={ev => updateExp(e.key, 'name', ev.target.value)} />
              <div className="mi" style={{ flex: 1.2 }}>
                <input type="number" min="0" step="100" placeholder="0" value={e.amount}
                  onChange={ev => updateExp(e.key, 'amount', ev.target.value)} />
              </div>
              <button className="btn bsm" style={{ padding: '8px 10px', flexShrink: 0 }} onClick={() => removeExp(e.key)}>✕</button>
            </div>
          ))}
          <button className="aeb" onClick={addExp}>+ Добавить расход</button>
          {expTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 8 }}>
              <span style={{ color: 'var(--mu)' }}>Итого расходы</span>
              <span style={{ fontWeight: 700, color: 'var(--re)' }}>{fmt(expTotal)}</span>
            </div>
          )}
        </div>

        {/* ── Шаг 3: Терминал ── */}
        <div className="sd">Шаг 3 · 💳 Терминал</div>
        <div className="cblk">
          <div className="row2">
            <div className="fw"><div className="fl" style={{ color: 'var(--or)' }}>Kaspi Bank</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={kaspi} onChange={e => setKaspi(e.target.value)} /></div></div>
            <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Kaspi</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={kaspiReturn} onChange={e => setKaspiReturn(e.target.value)} /></div></div>
          </div>
          <div className="row2">
            <div className="fw"><div className="fl" style={{ color: 'var(--ye)' }}>Halyk Bank</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={halyk} onChange={e => setHalyk(e.target.value)} /></div></div>
            <div className="fw"><div className="fl" style={{ color: 'var(--re)' }}>Возврат Halyk</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={halykReturn} onChange={e => setHalykReturn(e.target.value)} /></div></div>
          </div>
        </div>

        {/* ── Шаг 4: Сертификаты ── */}
        <div className="sd">
          Шаг 4 · 🎓 Сертификаты <span className="pill pgr" style={{ fontSize: 10, verticalAlign: 'middle' }}>необязательно</span>
        </div>
        <div className="cblk">
          {certs.map((c, idx) => {
            const debtType = c.from ? getCertDebtType(c.from, store.store_group) : 'no_debt'
            const dl = debtLabel(debtType)
            return (
              <div key={c.key} className="cert-entry" style={{ borderColor: dl ? 'var(--re)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--pu)' }}>🎓 Сертификат #{idx + 1}</span>
                  <button className="btn bsm" style={{ padding: '4px 9px', fontSize: 12 }} onClick={() => removeCert(c.key)}>✕</button>
                </div>
                <div className="fw">
                  <div className="fl">Адрес / откуда сертификат</div>
                  <input type="text" placeholder="Женис 7, Жургенов 18, Абылайхана..."
                    value={c.from} onChange={e => updateCert(c.key, 'from', e.target.value)} />
                  {dl && (
                    <div style={{ background: 'var(--rb)', border: '1px solid rgba(240,112,112,.3)', borderRadius: 8, padding: '7px 10px', marginTop: 5, fontSize: 12, color: 'var(--re)' }}>
                      {dl} — {debtType === 'debt_saken' ? 'продан в Группе 1, используется в Группе 2' : 'продан в Группе 2, используется в Группе 1'}
                    </div>
                  )}
                </div>
                <div className="row2">
                  <div className="fw"><div className="fl">Сумма (₸)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={c.amount} onChange={e => updateCert(c.key, 'amount', e.target.value)} /></div></div>
                  <div className="fw"><div className="fl">Комментарий</div><input type="text" placeholder="..." value={c.comment} onChange={e => updateCert(c.key, 'comment', e.target.value)} /></div>
                </div>
              </div>
            )
          })}
          <button className="aeb pu" onClick={addCert}>🎓 Добавить сертификат</button>
        </div>

        {/* ── Шаг 5: Дополнительно ── */}
        <div className="sd">Шаг 5 · ✏️ Дополнительно</div>
        <div className="cblk">
          <div className="fw">
            <div className="fl">Количество сотрудников</div>
            <input type="number" min="1" value={emp} onChange={e => setEmp(e.target.value)} />
          </div>
          <div className="fw">
            <div className="fl">Комментарий</div>
            <textarea placeholder="Любые заметки о дне..." value={comment} onChange={e => setComment(e.target.value)} />
          </div>
        </div>

        {/* ── KPI ── */}
        {kpiSales > 0 && (
          <div className="kpi-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>📈 KPI (авто)</span>
              <span className="pill pa">авто</span>
            </div>
            <div className="fw" style={{ marginBottom: 6 }}>
              <input type="text" readOnly value={fmt(kpiSales)} />
            </div>
            <div className="prog-bg">
              <div className="prog-f" style={{ width: `${Math.min(pct / 2, 100)}%`, background: pCol(pct) }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mu)', marginBottom: 8 }}>
              <span>0%</span><span style={{ color: pCol(pct) }}>{pct}%</span><span>200%</span>
            </div>
            <div className="row2">
              <div className="mc"><div className="mc-l">Выполнение</div><div className="mc-v" style={{ color: pCol(pct) }}>{pct}%</div></div>
              <div className="mc"><div className="mc-l">Бонус / сотр.</div><div className="mc-v">{fmt(bonPer)}</div></div>
            </div>
          </div>
        )}

        <button className="btn bp bb2" onClick={handleSubmit} disabled={submitting} style={{ marginTop: '.5rem' }}>
          {submitting ? 'Отправка...' : isReturn ? 'Отправить исправленный отчёт' : 'Отправить отчёт'}
        </button>
        {submitOk && <div className="om2">✅ Отчёт отправлен!</div>}
      </div>
    </>
  )
}
