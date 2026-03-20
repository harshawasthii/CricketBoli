import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, playerId } = await req.json();
    const { roomId } = params; // Room code

    // Validation
    const { data: room } = await supabase.from('rooms').select('id, status').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    const { data: membership } = await supabase.from('room_participants')
      .select('budget')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.budget < amount) {
      return NextResponse.json({ error: 'Insufficient budget' }, { status: 400 });
    }

    const { data: player } = await supabase.from('players').select('nationality_type').eq('id', playerId).single();
    if (player?.nationality_type?.toLowerCase() === 'overseas') {
      const { data: rosters } = await supabase.from('rosters')
        .select('player:players(nationality_type)')
        .eq('room_id', room.id)
        .eq('user_id', user.id);
      
      const overseasCount = rosters ? rosters.filter(r => (r.player as any)?.nationality_type?.toLowerCase() === 'overseas').length : 0;
      if (overseasCount >= 10) {
        return NextResponse.json({ error: 'Max 10 overseas players reached!' }, { status: 400 });
      }
    }

    // Success response - the client will then broadcast the bid to others
    return NextResponse.json({ success: true, userId: user.id, amount });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
