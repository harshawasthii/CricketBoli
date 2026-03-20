import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      console.error('Create Room Error: Unauthorized - Missing or invalid JWT');
      return NextResponse.json({ error: 'Unauthorized. Please login again.' }, { status: 401 });
    }

    const { code, password } = await req.json();

    if (!code || !password) {
      return NextResponse.json({ error: 'Room code and password are required' }, { status: 400 });
    }

    // Check Supabase connection/table
    const { data: existingRoom, error: checkError } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle();
    
    if (checkError) {
      console.error('Supabase DB Error (Checking Existing Room):', checkError);
      return NextResponse.json({ error: 'Database Connection Error. Are your Supabase Keys correct on Vercel?' }, { status: 500 });
    }

    if (existingRoom) {
      return NextResponse.json({ error: 'Room code already exists' }, { status: 400 });
    }

    // Insert Room
    const { data: room, error: roomError } = await supabase.from('rooms').insert([{
      code,
      password,
      admin_id: user.id,
      status: 'WAITING'
    }]).select().single();

    if (roomError || !room) {
      console.error('Supabase Insert Room Error:', roomError);
      return NextResponse.json({ error: 'Failed to create room. check Supabase RLS policy or table structure!' }, { status: 500 });
    }

    // Add Admin as First Participant
    const { error: partErr } = await supabase.from('room_participants').insert([{
      room_id: room.id,
      user_id: user.id,
      budget: 1500000000 // 150 Cr default
    }]);

    if(partErr) console.error('Supabase Participant Error:', partErr);

    return NextResponse.json(room, { status: 201 });
  } catch (error: any) {
    console.error('Vercel API CRITICAL ERROR:', error.message);
    return NextResponse.json({ error: 'Server exploded! Check Vercel logs for help.' }, { status: 500 });
  }
}
