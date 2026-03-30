import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ShopPage from './pages/ShopPage'
import AdminPage from './pages/AdminPage'
import ReviewerPage from './pages/ReviewerPage'
import CashierPage from './pages/CashierPage'
import type { UserProfile } from './types'
import type { Session } from '@supabase/supabase-js'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) {
      console.error('Profile load error:', error)
      // Auto-create profile if missing (edge case)
      setProfile(null)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', fontFamily: 'Onest, sans-serif', color: '#7c7c99', background: '#0c0c10'
      }}>
        Загрузка...
      </div>
    )
  }

  if (!session) return <LoginPage />

  if (!profile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', fontFamily: 'Onest, sans-serif', color: '#7c7c99', background: '#0c0c10', gap: 16
      }}>
        <div>Пользователь не настроен. Обратитесь к администратору.</div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ background: '#1f1f29', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '8px 16px', color: '#ededf5', cursor: 'pointer', fontFamily: 'Onest, sans-serif' }}
        >
          Выйти
        </button>
      </div>
    )
  }

  switch (profile.role) {
    case 'shop':
      if (!profile.store_id) return <div className="ld">Магазин не назначен</div>
      return <ShopPage storeId={profile.store_id} />
    case 'admin':
      return <AdminPage />
    case 'reviewer':
      return <ReviewerPage />
    case 'cashier':
      return <CashierPage />
    default:
      return <div className="ld">Неизвестная роль: {profile.role}</div>
  }
}
