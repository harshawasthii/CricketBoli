import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = params;
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const { data: participants } = await supabase.from('room_participants')
      .select('user_id, budget, user:auth_users(name)')
      .eq('room_id', room.id);

    if (!participants) return NextResponse.json([]);

    const leaderboard = await Promise.all(participants.map(async (p) => {
      const { data: userRoster } = await supabase.from('rosters')
        .select('player_id')
        .eq('room_id', room.id)
        .eq('user_id', p.user_id);

      let totalPoints = 0;
      if (userRoster && userRoster.length > 0) {
        const playerIds = userRoster.map(r => r.player_id);
        const { data: scores } = await supabase.from('player_scores')
          .select('points')
          .in('player_id', playerIds);
        
        if (scores) totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
      }
      return { user: { id: p.user_id, name: (p.user as any).name }, budget: p.budget, totalPoints };
    }));

    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
    return NextResponse.json(leaderboard);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
