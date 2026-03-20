import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: allPlayers } = await supabase.from('players').select('*');
    if (!allPlayers) return NextResponse.json([]);

    // Category sorting logic based on CSV roles: Batsman, Wicketkeeper, All-Rounder, Bowler
    const batters = allPlayers.filter(p => p.role === 'Batsman' || p.role === 'Wicketkeeper');
    const bowlers = allPlayers.filter(p => p.role === 'Bowler');
    const allRounders = allPlayers.filter(p => p.role === 'All-Rounder');

    // Jumble/Shuffle helper (Fisher-Yates style)
    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    // Combine in requested order: Batters -> Bowlers -> All-Rounders
    const orderedPlayers = [
      ...shuffle(batters),
      ...shuffle(bowlers),
      ...shuffle(allRounders)
    ];

    return NextResponse.json(orderedPlayers);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
