import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = params; // Room code

    const { data: room } = await supabase.from('rooms').select('id, admin_id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.admin_id !== user.id) {
        return NextResponse.json({ error: 'Only admin can end the auction' }, { status: 403 });
    }

    // Update room status to COMPLETED
    const { error: updateErr } = await supabase.from('rooms').update({
      status: 'COMPLETED',
      current_player_id: null,
      current_bid: 0,
      highest_bidder_id: null
    }).eq('id', room.id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
