import { createClient } from '@supabase/supabase-js'

const url = 'https://xckcplnzdnmkyyftsifs.supabase.co'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhja2NwbG56ZG5ta3l5ZnRzaWZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDU0NTEsImV4cCI6MjA5MzYyMTQ1MX0.ovNGX4wzdV841YOJ8u3hU1lN0hcA_YT-2hCEXomuhRE'

const supabase = createClient(url, key)

async function main() {
  const { data, error } = await supabase.from('user_roles').select('user_id, role').eq('role', 'admin')
  if (error) {
    console.error('Error:', error.message)
    return
  }
  console.log('Admin roles found:', data?.length ?? 0)
  console.log(JSON.stringify(data, null, 2))

  if (data && data.length > 0) {
    const userIds = data.map((r: any) => r.user_id)
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('user_id, email, full_name, display_name, username').in('user_id', userIds)
    if (pErr) {
      console.error('Profile error:', pErr.message)
      return
    }
    console.log('\nProfiles:')
    console.log(JSON.stringify(profiles, null, 2))
  }
}

main()
