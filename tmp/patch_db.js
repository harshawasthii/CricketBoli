const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bqlrllerkdnngniwxhie.supabase.co';
const supabaseKey = 'sb_publishable_MKbYB6TVK2t3V0BoYxwNUg_6ZC_rSrm'; // Anon key might work if RLS allows

const supabase = createClient(supabaseUrl, supabaseKey);

async function patchStatus() {
  console.log('Patching rooms with status "ENDED" to "COMPLETED"...');
  const { data, error } = await supabase
    .from('rooms')
    .update({ status: 'COMPLETED' })
    .eq('status', 'ENDED')
    .select();

  if (error) {
    console.error('Error patching rooms:', error);
  } else {
    console.log('Successfully patched rooms:', data);
  }
}

patchStatus();
