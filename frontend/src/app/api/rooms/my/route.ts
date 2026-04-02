import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
export const dynamic = 'force-dynamic';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: participations } = await supabase.from('room_participants').select('room_id').eq('user_id', user.id);
    const participantIds = participations?.map(p => p.room_id) || [];

    // Fetch rooms where the user is an admin
    const { data: adminRooms, error: e1 } = await supabase.from('rooms').select('*').eq('admin_id', user.id);
    
    // Fetch rooms where the user is a participant
    let participantRooms: any[] = [];
    if (participantIds.length > 0) {
      const { data: pRooms, error: e2 } = await supabase.from('rooms').select('*').in('id', participantIds);
      if (pRooms) participantRooms = pRooms;
    }

    // Merge and deduplicate
    const allRoomsMap = new Map();
    (adminRooms || []).forEach(r => allRoomsMap.set(r.id, r));
    participantRooms.forEach(r => allRoomsMap.set(r.id, r));
    
    const rooms = Array.from(allRoomsMap.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
