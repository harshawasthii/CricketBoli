import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { AuthRequest } from '../middleware/auth.middleware';

// Scoring engine based on exact user rules
const calculatePoints = (stats: any) => {
  let points = 0;

  // BATTING POINTS
  points += (stats.runs || 0) * 1;
  points += (stats.fours || 0) * 4;
  points += (stats.sixes || 0) * 6;

  // Milestones (Non-cumulative)
  const runs = stats.runs || 0;
  if (runs >= 100) points += 16;
  else if (runs >= 75) points += 12;
  else if (runs >= 50) points += 8;
  else if (runs >= 25) points += 4;

  if (runs === 0 && stats.out) points -= 2;

  // BOWLING POINTS
  const wickets = stats.wickets || 0;
  points += wickets * 30;
  points += (stats.lbw_bowled || 0) * 8;
  
  // Wicket Bonus (Cumulative or not? Usually 5W replaces 4W replaces 3W. We will assume standard replacements)
  if (wickets >= 5) points += 12;
  else if (wickets === 4) points += 8;
  else if (wickets === 3) points += 4;

  points += (stats.maidens || 0) * 12;

  // FIELDING POINTS
  const catches = stats.catches || 0;
  points += catches * 8;
  if (catches >= 3) {
    points += 4; // 3 catch bonus (only once)
  }
  
  points += (stats.stumping || 0) * 12;
  points += (stats.direct_runout || 0) * 12;
  points += (stats.indirect_runout || 0) * 6;

  return points;
};

// Simulate hitting RapidAPI to compute scores
export const updateMatch = async (req: AuthRequest, res: Response) => {
  try {
    const { matchId } = req.params;
    
    // In reality, this loop would be `const data = await fetchRapidApiMatch(matchId)`
    // And we would parse it. Since we are in development, we will just randomly distribute 
    // real-looking points to the players currently in rosters to demonstrate!
    
    const { data: allPlayers } = await supabase.from('players').select('id, name');
    
    let totalUpdated = 0;
    
    if (allPlayers) {
      const updates = allPlayers.map(async (player) => {
        const isBatter = Math.random() > 0.5;
        const stats = {
          runs: isBatter ? Math.floor(Math.random() * 80) : Math.floor(Math.random() * 20),
          fours: isBatter ? Math.floor(Math.random() * 8) : 0,
          sixes: isBatter ? Math.floor(Math.random() * 4) : 0,
          out: Math.random() > 0.3,
          wickets: !isBatter ? Math.floor(Math.random() * 4) : 0,
          lbw_bowled: !isBatter ? Math.floor(Math.random() * 2) : 0,
          maidens: !isBatter ? Math.floor(Math.random() * 1) : 0,
          catches: Math.floor(Math.random() * 3),
          stumping: Math.random() > 0.95 ? 1 : 0,
          direct_runout: Math.random() > 0.95 ? 1 : 0,
          indirect_runout: Math.random() > 0.9 ? 1 : 0,
        };
        
        const pts = calculatePoints(stats);
        
        await supabase.from('player_scores').upsert({
          match_id: matchId,
          player_id: player.id,
          points: pts
        }, { onConflict: 'match_id, player_id' });

        totalUpdated++;
      });
      await Promise.all(updates);
    }

    res.json({ message: 'Scoring engine executed. Points distributed!', matchId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during sync' });
  }
};
