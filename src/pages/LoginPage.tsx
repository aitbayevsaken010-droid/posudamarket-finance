import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Store } from '../types'

const ROLE_EMAILS: Record<string, string> = {
  admin:    'admin@posuda.kz',
  reviewer: 'reviewer@posuda.kz',
  cashier:  'cashier@posuda.kz',
}

export default function LoginPage() {
  const [stores, setStores] = useState<Store[]>([])
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [selectedStoreSlug, setSelectedStoreSlug] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('display_order')
      .then(({ data }) => {
        if (data) setStores(data)
      })
  }, [])

  function selectRole(r: string) {
    setSelectedRole(r)
    setError('')
    setPassword('')
    if (r !== 'shop') setSelectedStoreSlug('')
    else if (stores.length) setSelectedStoreSlug(stores[0].slug)
  }

  async function doLogin() {
    if (!selectedRole) return
    setError('')
    setLoading(true)

    let email = ''
    if (selectedRole === 'shop') {
      if (!selectedStoreSlug) { setError('Выберите магазин'); setLoading(false); return }
      email = `shop.${selectedStoreSlug}@posuda.kz`
    } else {
      email = ROLE_EMAILS[selectedRole]
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr) {
      setError('Неверный пароль')
    }
    setLoading(false)
  }

  return (
    <div id="auth-screen">
      <div className="auth-box">
        <div className="auth-logo">Posudamarket · Астана</div>
        <h1 className="auth-title">Финансовый контроль</h1>
        <p className="auth-sub">Выберите роль и войдите</p>

        <div className="role-btns">
          {[
            { id: 'shop',     ic: '🏪', t: 'Магазин',        s: 'Сдать отчёт' },
            { id: 'admin',    ic: '📊', t: 'Администратор',   s: 'Ввести Paloma' },
            { id: 'reviewer', ic: '🔍', t: 'Проверяющий',     s: 'Сверка и контроль' },
            { id: 'cashier',  ic: '💰', t: 'Инкассатор',      s: 'Инкассация' },
          ].map(r => (
            <div
              key={r.id}
              className={`role-btn${selectedRole === r.id ? ' sel' : ''}`}
              onClick={() => selectRole(r.id)}
            >
              <div className="role-btn-ic">{r.ic}</div>
              <div className="role-btn-t">{r.t}</div>
              <div className="role-btn-s">{r.s}</div>
            </div>
          ))}
        </div>

        {selectedRole && (
          <div>
            {selectedRole === 'shop' && (
              <div className="fw">
                <div className="fl">Магазин</div>
                <select
                  value={selectedStoreSlug}
                  onChange={e => setSelectedStoreSlug(e.target.value)}
                >
                  {stores.map(s => (
                    <option key={s.slug} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="fw">
              <div className="fl">Пароль</div>
              <input
                type="password"
                placeholder="••••••"
                maxLength={20}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doLogin()}
              />
            </div>

            <button
              className="btn bp bb2"
              onClick={doLogin}
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>

            {error && <div className="em2">{error}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
