import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getAuthUser } from '@/lib/authUtils';

export async function POST(req: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { amount, playerId } = await req.json();
    const { roomId } = params; // Room code

    // Validation: Check current player and current bid
    const { data: room } = await supabase.from('rooms').select('id, status, current_player_id, current_bid, highest_bidder_id').eq('code', roomId).single();
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.status === 'COMPLETED') return NextResponse.json({ error: 'Auction already ended' }, { status: 400 });
    if (room.current_player_id !== playerId) return NextResponse.json({ error: 'This player is no longer active' }, { status: 400 });
    
    // CRITICAL: Prevent price reset/drop bug, but allow opening bid to equal base price
    const currentBid = room.current_bid || 0;
    const isOpeningBid = !room.highest_bidder_id;

    if (isOpeningBid) {
        if (amount < currentBid) {
            return NextResponse.json({ error: 'Opening bid must be at least the base price' }, { status: 400 });
        }
    } else {
        if (amount <= currentBid) {
            return NextResponse.json({ 
                error: 'The price has increased! Please refresh or try again.', 
                currentBid: room.current_bid 
            }, { status: 409 });
        }
    }

    const { data: membership } = await supabase.from('room_participants')
      .select('budget')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.budget < amount) {
      return NextResponse.json({ error: 'Insufficient budget' }, { status: 400 });
    }

    const { data: player } = await supabase.from('players').select('nationality_type').eq('id', playerId).single();
    if (player?.nationality_type?.toLowerCase() === 'overseas') {
      const { data: rosters } = await supabase.from('rosters')
        .select('player:players(nationality_type)')
        .eq('room_id', room.id)
        .eq('user_id', user.id);
      
      const overseasCount = rosters ? rosters.filter(r => (r.player as any)?.nationality_type?.toLowerCase() === 'overseas').length : 0;
      if (overseasCount >= 10) {
        return NextResponse.json({ error: 'Max 10 overseas players reached!' }, { status: 400 });
      }
    }

    // Success response - persist bid in database so it's not lost on refresh
    await supabase.from('rooms').update({
      current_player_id: playerId,
      current_bid: amount,
      highest_bidder_id: user.id
    }).eq('id', room.id);

    return NextResponse.json({ success: true, userId: user.id, amount });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
