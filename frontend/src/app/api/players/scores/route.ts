import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request) {
  try {
    // Optional: Only admins or system can update scores
    // For now, we allow authenticated users to update for testing
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scores = await req.json();

    if (!Array.isArray(scores)) {
      return NextResponse.json({ error: 'Body must be an array' }, { status: 400 });
    }

    // Upsert scores to match_player_scores table
    // Expects: [{ player_id, match_number, points }]
    const { error } = await supabase
      .from('match_player_scores')
      .upsert(scores, { onConflict: 'player_id, match_number' });

    if (error) {
      console.error('Upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: scores.length });
  } catch (error) {
    console.error('Scoring API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
