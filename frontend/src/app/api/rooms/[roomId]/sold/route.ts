import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { playerId, buyerId, amount } = await req.json();
    const { roomId } = params; // Room code

    const { data: room } = await supabase.from('rooms').select('id, admin_id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.admin_id !== user.id) {
        return NextResponse.json({ error: 'Only admin can finalize sales' }, { status: 403 });
    }

    // Insert into rosters
    const { error: rosterErr } = await supabase.from('rosters').insert({
        room_id: room.id,
        user_id: buyerId,
        player_id: playerId,
        bought_for: amount
    });

    if (rosterErr) throw rosterErr;

    // Update budget
    const { data: participant } = await supabase.from('room_participants')
        .select('budget, id')
        .eq('room_id', room.id)
        .eq('user_id', buyerId)
        .single();
    
    if (participant) {
        await supabase.from('room_participants').update({
        budget: participant.budget - amount
        }).eq('id', participant.id);
    }

    return NextResponse.json({ success: true, playerId, userId: buyerId, amount });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
