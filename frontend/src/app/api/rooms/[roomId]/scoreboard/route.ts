import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function GET(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = params; // This is the room code
    
    // Find room by code
    const { data: room, error: roomErr } = await supabase
      .from('rooms')
      .select('id, code')
      .eq('code', roomId)
      .single();

    if (!room || roomErr) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Fetch all participants to get their names
    const { data: participants, error: partErr } = await supabase
      .from('room_participants')
      .select('user_id, user:auth_users(name)')
      .eq('room_id', room.id);

    if (partErr || !participants) {
      return NextResponse.json({ error: 'No participants found' }, { status: 404 });
    }

    // Fetch all rosters for this room
    const { data: allRosters, error: rostErr } = await supabase
      .from('rosters')
      .select('user_id, player_id, p:players(id, name, team, role)')
      .eq('room_id', room.id);

    if (rostErr) {
      return NextResponse.json({ error: 'Failed to fetch rosters' }, { status: 500 });
    }

    // Fetch all scores
    const { data: allScores } = await supabase
      .from('player_scores')
      .select('player_id, points');

    const scoreMap = new Map();
    if (allScores) {
      allScores.forEach(s => scoreMap.set(s.player_id, s.points));
    }

    // Build the scoreboard
    const scoreboard = participants.map(p => {
      const userRosters = (allRosters || []).filter(r => r.user_id === p.user_id);
      
      const players = userRosters.map(r => {
        const pInfo = r.p as any;
        const score = scoreMap.get(r.player_id) || 0;
        return {
          id: pInfo.id,
          name: pInfo.name,
          team: pInfo.team,
          role: pInfo.role,
          score: score
        };
      });

      const totalScore = players.reduce((sum, pl) => sum + pl.score, 0);

      return {
        userId: p.user_id,
        userName: (p.user as any)?.name || 'Unknown',
        totalScore,
        players
      };
    });

    // Sort by score descending
    scoreboard.sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json(scoreboard);
  } catch (error) {
    console.error('Scoreboard API error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
