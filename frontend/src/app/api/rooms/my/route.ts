import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: participations } = await supabase.from('room_participants').select('room_id').eq('user_id', user.id);
    if (!participations || participations.length === 0) {
      return NextResponse.json([]);
    }

    const roomIds = participations.map(p => p.room_id);
    const { data: rooms } = await supabase.from('rooms').select('*').in('id', roomIds).order('created_at', { ascending: false });

    const roomsWithPoints = await Promise.all((rooms || []).map(async (room) => {
      const { data: userRoster } = await supabase.from('rosters')
        .select('player_id')
        .eq('room_id', room.id)
        .eq('user_id', user.id);

      let totalPts = 0;
      if (userRoster && userRoster.length > 0) {
        const playerIds = userRoster.map(r => r.player_id);
        const { data: scores } = await supabase.from('player_scores')
          .select('points')
          .in('player_id', playerIds);
        
        if (scores) {
          totalPts = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        }
      }
      return { ...room, myPoints: totalPts };
    }));
    
    return NextResponse.json(roomsWithPoints);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
