import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Giriş yapmış kullanıcı → dashboard
    redirect('/dashboard')
  } else {
    // Giriş yapmamış → stüdyo (freemium yok, direkt başlat)
    redirect('/studyo')
  }
}
