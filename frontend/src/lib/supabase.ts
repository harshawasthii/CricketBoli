import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use Service Role Key on the server if available, otherwise fall back to Anon Key
const supabaseKey = (typeof window === 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) { 
  console.warn('CRITICAL WARNING: Supabase URL or Key is missing from Environment Variables (Vercel).'); 
}

export const supabase = createClient(supabaseUrl || 'https://empty.supabase.co', supabaseKey || 'empty-key', {
  auth: { persistSession: false }
});
