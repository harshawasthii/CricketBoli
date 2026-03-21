const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching room:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in "rooms" table:', Object.keys(data[0]));
  } else {
    console.log('No rooms found to check columns.');
  }
}

checkSchema();
