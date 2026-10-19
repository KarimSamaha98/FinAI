import { createClient } from '@supabase/supabase-js'

// When the app is opened from another device on the LAN (a phone), a
// localhost/127.0.0.1 URL points at that device, not the Mac. Swap the host
// for the one the page was actually served from, so the same build works on
// the Mac itself and from a phone.
const configuredUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseUrl = configuredUrl?.replace(/\/\/(?:localhost|127\.0\.0\.1)(?=[:/]|$)/, `//${window.location.hostname}`)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — auth will not work until apps/web/.env.local is configured.',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
