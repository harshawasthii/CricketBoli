import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if(!supabaseUrl || !supabaseKey) { 
  console.warn('CRITICAL WARNING: Supabase URL or Key is missing from Environment Variables (Vercel).'); 
}

export const supabase = createClient(supabaseUrl || 'https://empty.supabase.co', supabaseKey || 'empty-key', {
  auth: { persistSession: false }
});
