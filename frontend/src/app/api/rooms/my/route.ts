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
    const participantIds = participations?.map(p => p.room_id) || [];

    let query = supabase.from('rooms').select('*');
    
    if (participantIds.length > 0) {
      const idStr = participantIds.map(id => `"${id}"`).join(',');
      query = query.or(`id.in.(${idStr}),admin_id.eq."${user.id}"`);
    } else {
      query = query.eq('admin_id', user.id);
    }
    
    const { data: rooms } = await query.order('created_at', { ascending: false });

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
