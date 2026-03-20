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

    const { data: squads } = await supabase.from('rosters')
      .select(`
        *,
        player:players(*),
        user:auth_users(id, name, email)
      `)
      .eq('room_id', room.id);

    return NextResponse.json(squads || []);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
