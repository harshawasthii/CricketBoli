import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, password } = await req.json();

    if (!code || !password) {
      return NextResponse.json({ error: 'Room code and password are required' }, { status: 400 });
    }

    const { data: existingRoom } = await supabase.from('rooms').select('id').eq('code', code).single();
    if (existingRoom) {
      return NextResponse.json({ error: 'Room code already exists' }, { status: 400 });
    }

    const { data: room, error: roomError } = await supabase.from('rooms').insert([{
      code,
      password,
      admin_id: user.id,
      status: 'WAITING'
    }]).select().single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
    }

    await supabase.from('room_participants').insert([{
      room_id: room.id,
      user_id: user.id,
      budget: 1500000000 // 150 Cr default
    }]);

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
