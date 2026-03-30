import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, today, prevDay } from '../lib/utils'
import type { Store, DailyReport, CashCollection } from '../types'

export default function CashierPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [todayRpts, setTodayRpts] = useState<Record<string, DailyReport>>({})
  const [ydRpts, setYdRpts] = useState<Record<string, DailyReport>>({})
  const [incToday, setIncToday] = useState<Record<string, CashCollection[]>>({})
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modal, setModal] = useState<Store | null>(null)
  const [incDate, setIncDate] = useState(today())
  const [incAmt, setIncAmt] = useState('')
  const [incWho, setIncWho] = useState('')
  const [incTime, setIncTime] = useState('')
  const [incNote, setIncNote] = useState('')
  const [incSaving, setIncSaving] = useState(false)
  const [incOk, setIncOk] = useState(false)

  const td = today()
  const yd = prevDay(td)

  useEffect(() => {
    supabase.from('stores').select('*').order('display_order').then(({ data }) => {
      if (data) setStores(data)
    })
  }, [])

  const load = useCallback(async () => {
    if (!stores.length) return
    setLoading(true)
    const storeIds = stores.map(s => s.id)

    const [{ data: tRpts }, { data: yRpts }, { data: incData }] = await Promise.all([
      supabase.from('daily_reports').select('*').in('store_id', storeIds).eq('date', td),
      supabase.from('daily_reports').select('*').in('store_id', storeIds).eq('date', yd),
      supabase.from('cash_collections').select('*').in('store_id', storeIds).eq('date', td),
    ])

    const tMap: Record<string, DailyReport> = {}
    if (tRpts) tRpts.forEach((r: DailyReport) => { tMap[r.store_id] = r })

    const yMap: Record<string, DailyReport> = {}
    if (yRpts) yRpts.forEach((r: DailyReport) => { yMap[r.store_id] = r })

    const incMap: Record<string, CashCollection[]> = {}
    if (incData) {
      incData.forEach((i: CashCollection) => {
        if (!incMap[i.store_id]) incMap[i.store_id] = []
        incMap[i.store_id].push(i)
      })
    }

    setTodayRpts(tMap)
    setYdRpts(yMap)
    setIncToday(incMap)
    setLoading(false)
  }, [stores, td, yd])

  useEffect(() => { load() }, [load])

  function openModal(store: Store) {
    setModal(store)
    setIncDate(td)
    setIncAmt('')
    setIncWho('')
    setIncTime('')
    setIncNote('')
    setIncOk(false)
  }

  async function saveInc() {
    if (!modal) return
    const amt = parseFloat(incAmt)
    if (!amt || amt <= 0) { alert('Введите сумму'); return }
    setIncSaving(true)

    await supabase.from('cash_collections').insert({
      store_id: modal.id,
      date: incDate,
      amount: amt,
      collected_by: incWho || null,
      collected_time: incTime || null,
      note: incNote || null,
    })

    // Trigger will update daily_report.incassated_total + effective_end_cash automatically

    await supabase.from('audit_logs').insert({
      store_id: modal.id,
      report_date: incDate,
      role: 'cashier',
      action: 'Инкассация добавлена',
      detail: `${fmt(amt)}${incWho ? ' · ' + incWho : ''}`,
    })

    setIncOk(true)
    setTimeout(async () => {
      setModal(null)
      await load()
    }, 1500)
    setIncSaving(false)
  }

  async function logout() { await supabase.auth.signOut() }

  return (
    <>
      <div className="topbar">
        <button className="btn bsm" onClick={logout}>← Выйти</button>
        <span className="tb-t">Инкассация</span>
        <button className="btn bsm" onClick={load}>↻</button>
      </div>

      <div className="wrap-wide">
        {loading
          ? <div className="ld">Загрузка...</div>
          : stores.map(store => {
            const tRpt = todayRpts[store.id]
            const yRpt = ydRpts[store.id]
            const todayInc = incToday[store.id] || []
            const todayIncTot = todayInc.reduce((a, i) => a + i.amount, 0)
            const endCash = tRpt?.end_cash || 0
            const effectiveLeft = tRpt?.effective_end_cash || 0
            const ydEff = yRpt?.effective_end_cash ?? yRpt?.end_cash ?? null

            return (
              <div key={store.id} className={`cbc${todayIncTot > 0 ? ' ok' : ''}`}>
                <div className="cbc-hd">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{store.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--mu)' }}>{todayInc.length} инкассаций сегодня{todayIncTot > 0 ? ` · ${fmt(todayIncTot)}` : ''}</div>
                  </div>
                  <button className="btn bg2" onClick={() => openModal(store)}>+ Добавить</button>
                </div>

                <div className="cbc-g">
                  {tRpt ? <>
                    <div className="cbc-c"><div className="cbc-cl">Касса конец дня</div><div className="cbc-cv" style={{ color: 'var(--ye)' }}>{fmt(endCash)}</div></div>
                    <div className="cbc-c"><div className="cbc-cl">Инкасс. сегодня</div><div className="cbc-cv" style={{ color: 'var(--bl)' }}>{fmt(todayIncTot)}</div></div>
                    <div className="cbc-c" style={{ border: '1px solid rgba(45,212,160,.3)' }}>
                      <div className="cbc-cl">Остаток (начало завтра)</div>
                      <div className="cbc-cv" style={{ color: 'var(--gr)', fontSize: 16 }}>{fmt(effectiveLeft)}</div>
                    </div>
                  </> : (
                    <div className="cbc-c"><div className="cbc-cl">Сегодня</div><div className="cbc-cv" style={{ color: 'var(--mu)' }}>нет отчёта</div></div>
                  )}
                  {ydEff !== null && (
                    <div className="cbc-c"><div className="cbc-cl">Остаток вчера</div><div className="cbc-cv">{fmt(ydEff)}</div></div>
                  )}
                </div>

                {todayInc.length > 0
                  ? todayInc.map((r, i) => (
                    <div key={i} className="corr-row">
                      <span style={{ color: 'var(--al)', minWidth: 70 }}>{r.date}</span>
                      <span style={{ flex: 1, margin: '0 8px' }}>{r.collected_by || '—'}{r.collected_time ? ' · ' + r.collected_time : ''}</span>
                      {r.note && <span style={{ fontSize: 12, color: 'var(--mu)' }}>{r.note}</span>}
                      <span style={{ fontWeight: 700, color: 'var(--bl)' }}>{fmt(r.amount)}</span>
                    </div>
                  ))
                  : <div style={{ fontSize: 13, color: 'var(--mu)', padding: '4px 0' }}>Инкассаций сегодня нет</div>
                }
              </div>
            )
          })
        }
      </div>

      {/* ══ MODAL: Add incassation ══ */}
      {modal && (
        <div className="mo open" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="md" style={{ maxWidth: 440 }}>
            <div className="mhd">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Добавить инкассацию</div>
                <div style={{ fontSize: 12, color: 'var(--mu)', marginTop: 2 }}>{modal.name}</div>
              </div>
              <button className="mx" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="mb2">
              <div className="fw"><div className="fl">Дата</div><input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} /></div>
              <div className="fw"><div className="fl">Сумма (₸)</div><div className="mi"><input type="number" min="0" step="100" placeholder="0" value={incAmt} onChange={e => setIncAmt(e.target.value)} /></div></div>
              <div className="fw"><div className="fl">Кто забрал / банк</div><input type="text" placeholder="Kaspi Bank, инкассатор..." value={incWho} onChange={e => setIncWho(e.target.value)} /></div>
              <div className="fw"><div className="fl">Время</div><input type="time" value={incTime} onChange={e => setIncTime(e.target.value)} /></div>
              <div className="fw"><div className="fl">Комментарий</div><textarea placeholder="..." value={incNote} onChange={e => setIncNote(e.target.value)} /></div>
              <button className="btn bp bb2" onClick={saveInc} disabled={incSaving}>
                {incSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
              {incOk && <div className="om2">✓ Сохранено!</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
