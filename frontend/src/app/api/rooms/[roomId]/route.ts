import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { roomId } = params; // This is the room code

    // First find room by code
    const { data: room, error: roomErr } = await supabase.from('rooms')
      .select('*')
      .eq('code', roomId)
      .single();

    if (!room || roomErr) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Then get participants
    const { data: roomUsers } = await supabase.from('room_participants')
      .select(`
        *,
        user:auth_users(id, name, email)
      `)
      .eq('room_id', room.id);

    // Fetch auction history to persist room states
    const { data: rosters } = await supabase.from('rosters')
      .select('id, player_id, user_id, bought_for, created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });
      
    const { data: unsold } = await supabase.from('unsold_players')
      .select('id, player_id, created_at')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ 
       ...room, 
       roomUsers: roomUsers || [],
       rosters: rosters || [],
       unsold: unsold || []
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
