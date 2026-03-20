import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function DELETE(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = params; // Room code
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

    await supabase.from('room_participants').delete().eq('room_id', room.id).eq('user_id', user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
