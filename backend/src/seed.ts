import fs from 'fs';
import csvParser from 'csv-parser';
import { supabase } from './lib/supabase';
import path from 'path';

async function seed() {
  const players: any[] = [];
  const csvFilePath = path.join(__dirname, '../../Iplplayers2026_updated.csv');

  console.log('Reading players from CSV...');
  
  fs.createReadStream(csvFilePath)
    .pipe(csvParser())
    .on('data', (row) => {
      // id,name,team,role,base_price,nationality_type
      players.push({
        id: parseInt(row.id),
        name: row.name,
        team: row.team,
        role: row.role,
        base_price: row.base_price,
        nationality_type: row.nationality_type
      });
    })
    .on('end', async () => {
      console.log(`Parsed ${players.length} players. Inserting into Supabase...`);
      
      const { data, error } = await supabase
        .from('players')
        .upsert(players, { onConflict: 'id' });

      if (error) {
        console.error('Error inserting players:', error.message);
      } else {
        console.log('Successfully seeded players!');
      }
    });
}

seed();
