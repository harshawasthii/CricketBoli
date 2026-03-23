import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { playerId } = await req.json();
    const { roomId } = params; // Room code

    const { data: room } = await supabase.from('rooms').select('id, admin_id, highest_bidder_id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.admin_id !== user.id) {
        return NextResponse.json({ error: 'Only admin can mark unsold' }, { status: 403 });
    }


    // Insert into unsold
    const { error: unsoldErr } = await supabase.from('unsold_players').upsert({
        room_id: room.id,
        player_id: playerId
    }, { onConflict: 'room_id, player_id' });

    if (unsoldErr) throw unsoldErr;

    // Clear current auction state in database
    await supabase.from('rooms').update({
      current_player_id: null,
      current_bid: 0,
      highest_bidder_id: null
    }).eq('id', room.id);

    return NextResponse.json({ success: true, playerId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
