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

    const { data: room } = await supabase.from('rooms').select('id, password').eq('code', code).single();
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.password !== password) {
      return NextResponse.json({ error: 'Incorrect room password' }, { status: 401 });
    }

    const { data: existingMembership } = await supabase.from('room_participants')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();

    if (existingMembership) {
      return NextResponse.json({ error: 'Already joined this room' }, { status: 400 });
    }

    await supabase.from('room_participants').insert([{
      room_id: room.id,
      user_id: user.id,
      budget: 1500000000 // 150 Cr default
    }]);

    return NextResponse.json({ message: 'Joined room successfully', room }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
