import { Server, Socket } from 'socket.io';
import { supabase } from '../lib/supabase';

interface AuctionState {
  room_id: string;
  current_player_id: number | null;
  current_player_is_overseas: boolean;
  current_bid: number;
  highest_bidder_id: string | null;
  status: 'IDLE' | 'ONCE' | 'TWICE' | 'THRICE' | 'SOLD' | 'UNSOLD' | 'PAUSED';
  timer: NodeJS.Timeout | null;
}

const activeRooms: Record<string, AuctionState> = {};

const getCleanState = (state: AuctionState) => {
  const { timer, ...clean } = state;
  return clean;
};

export const initializeSockets = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    const broadcastBotMessage = (roomId: string, message: string) => {
      io.to(roomId).emit('biddu_message', { message });
    };

    const processSoldUnsold = async (roomId: string) => {
      const state = activeRooms[roomId];
      if (!state || !state.current_player_id) return;

      if (!state.highest_bidder_id) {
         state.status = 'UNSOLD';
         broadcastBotMessage(roomId, 'UNSOLD!');
         
         const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
         if (room) {
           await supabase.from('unsold_players').upsert({
             room_id: room.id,
             player_id: state.current_player_id
           }, { onConflict: 'room_id, player_id' });
         }
         io.to(roomId).emit('player_unsold', { playerId: state.current_player_id });
      } else {
         state.status = 'SOLD';
         broadcastBotMessage(roomId, `SOLD!`);
         
         const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
         if (room) {
           await supabase.from('rosters').insert({
             room_id: room.id,
             user_id: state.highest_bidder_id,
             player_id: state.current_player_id,
             bought_for: state.current_bid
           });

           const { data: participant } = await supabase.from('room_participants')
             .select('budget, id')
             .eq('room_id', room.id)
             .eq('user_id', state.highest_bidder_id)
             .single();
           
           if (participant) {
             await supabase.from('room_participants').update({
               budget: participant.budget - state.current_bid
             }).eq('id', participant.id);
           }
         }
         io.to(roomId).emit('player_sold_success', { 
           playerId: state.current_player_id, 
           userId: state.highest_bidder_id, 
           amount: state.current_bid 
         });
      }

      state.current_player_id = null;
      state.current_bid = 0;
      state.highest_bidder_id = null;
      if (state.timer) clearTimeout(state.timer);
    };

    const startTimer = (roomId: string) => {
      const state = activeRooms[roomId];
      if (!state) return;
      if (state.timer) clearTimeout(state.timer);

      state.status = 'IDLE';
      io.to(roomId).emit('room_update', { state: getCleanState(state) });
      
      // 7 seconds Idle -> Going Once
      state.timer = setTimeout(() => {
        state.status = 'ONCE';
        broadcastBotMessage(roomId, 'Going ONCE!');
        io.to(roomId).emit('room_update', { state: getCleanState(state) });
        
        // 2 seconds -> Going Twice
        state.timer = setTimeout(() => {
          state.status = 'TWICE';
          broadcastBotMessage(roomId, 'Going TWICE!');
          io.to(roomId).emit('room_update', { state: getCleanState(state) });

          // 2 seconds -> Going Thrice
          state.timer = setTimeout(() => {
            state.status = 'THRICE';
            broadcastBotMessage(roomId, 'Going THRICE!');
            io.to(roomId).emit('room_update', { state: getCleanState(state) });

            // 3 seconds -> Sold
            state.timer = setTimeout(() => {
              processSoldUnsold(roomId);
            }, 3000); // 3s
          }, 2000); // 2s
        }, 2000); // 2s
      }, 7000); // 7s
    };

    socket.on('join_room', async ({ roomId, userId }) => {
      socket.join(roomId);
      if (!activeRooms[roomId]) {
        activeRooms[roomId] = { room_id: roomId, current_player_id: null, current_player_is_overseas: false, current_bid: 0, highest_bidder_id: null, status: 'IDLE', timer: null };
      }
      io.to(roomId).emit('room_update', { message: 'A user joined', state: getCleanState(activeRooms[roomId]) });
    });

    socket.on('start_auction', async ({ roomId, playerId }) => {
      const { data: player } = await supabase.from('players').select('*').eq('id', playerId).single();
      if (!player) return;

      if (!activeRooms[roomId]) {
        activeRooms[roomId] = { room_id: roomId, current_player_id: null, current_player_is_overseas: false, current_bid: 0, highest_bidder_id: null, status: 'IDLE', timer: null };
      }

      activeRooms[roomId].current_player_id = playerId;
      activeRooms[roomId].current_player_is_overseas = player.nationality_type?.toLowerCase() === 'overseas';
      
      let baseStr = String(player.base_price).toLowerCase().trim();
      let num = parseFloat(baseStr.replace(/[^0-9.]/g, '')) || 0;
      let actualBase = num;
      if (baseStr.includes('cr')) actualBase = Math.round(num * 10000000);
      else if (baseStr.includes('l')) actualBase = Math.round(num * 100000);

      activeRooms[roomId].current_bid = actualBase;
      activeRooms[roomId].highest_bidder_id = null;
      
      broadcastBotMessage(roomId, `Up next: ${player.name} at Base Price ${player.base_price}`);
      io.to(roomId).emit('auction_started', { player, base_price: actualBase });
      
      startTimer(roomId);
    });

    socket.on('place_bid', async ({ roomId, userId, amount }) => {
      console.log(`[BID ATTEMPT] User: ${userId} | Room: ${roomId} | Amount: ${amount}`);
      const state = activeRooms[roomId];
      if (!state || !state.current_player_id) {
         console.log(`[BID FAIL] No active auction`);
         return socket.emit('error', { message: 'No active auction' });
      }

      // Hard block: reject bids if the round is already finalized
      if (state.status === 'SOLD' || state.status === 'UNSOLD') {
        console.log(`[BID FAIL] Auction already finalized (${state.status})`);
        return socket.emit('error', { message: 'This player has already been sold!' });
      }

      const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
      if (!room) {
         console.log(`[BID FAIL] Room not found in DB`);
         return socket.emit('error', { message: 'Room not found' });
      }

      const { data: membership } = await supabase.from('room_participants')
        .select('budget')
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .single();

      if (!membership) {
        console.log(`[BID FAIL] Membership not found for User: ${userId}`);
        return socket.emit('error', { message: 'Insufficient budget (not in room)' });
      }
      if (membership.budget < amount) {
        console.log(`[BID FAIL] Budget too low: ${membership.budget} < ${amount}`);
        return socket.emit('error', { message: 'Insufficient budget' });
      }

      if (amount <= state.current_bid && state.highest_bidder_id) {
        console.log(`[BID FAIL] Bid too low: ${amount} <= ${state.current_bid}`);
        return socket.emit('error', { message: 'Bid must be higher than current bid' });
      }

      if (state.current_player_is_overseas) {
        const { data: rosters } = await supabase.from('rosters')
          .select('player:players(nationality_type)')
          .eq('room_id', room.id)
          .eq('user_id', userId);
        
        let overseasCount = 0;
        if (rosters) {
          overseasCount = rosters.filter(r => (r.player as any)?.nationality_type?.toLowerCase() === 'overseas').length;
        }
        
        if (overseasCount >= 10) {
          console.log(`[BID FAIL] Overseas limit reached`);
          return socket.emit('error', { message: 'Max 10 overseas players reached!' });
        }
      }

      console.log(`[BID SUCCESS] Bid accepted! Assigning to ${userId}`);
      state.current_bid = amount;
      state.highest_bidder_id = userId;

      broadcastBotMessage(roomId, `New bid of ${amount} placed!`);
      io.to(roomId).emit('bid_placed', { userId, amount });
      
      startTimer(roomId);
    });

    socket.on('pause_auction', ({ roomId }) => {
      const state = activeRooms[roomId];
      if (state && state.timer) {
        clearTimeout(state.timer);
        state.status = 'PAUSED';
        broadcastBotMessage(roomId, 'Auction PAUSED by Admin');
        io.to(roomId).emit('room_update', { state: getCleanState(state) });
      }
    });

    socket.on('resume_auction', ({ roomId }) => {
      const state = activeRooms[roomId];
      if (state && state.status === 'PAUSED') {
        broadcastBotMessage(roomId, 'Auction RESUMED!');
        
        // Jump straight to ONCE sequence
        state.status = 'ONCE';
        broadcastBotMessage(roomId, 'Going ONCE!');
        io.to(roomId).emit('room_update', { state: getCleanState(state) });

        state.timer = setTimeout(() => {
          state.status = 'TWICE';
          broadcastBotMessage(roomId, 'Going TWICE!');
          io.to(roomId).emit('room_update', { state: getCleanState(state) });

          state.timer = setTimeout(() => {
            state.status = 'THRICE';
            broadcastBotMessage(roomId, 'Going THRICE!');
            io.to(roomId).emit('room_update', { state: getCleanState(state) });

            state.timer = setTimeout(() => {
              processSoldUnsold(roomId);
            }, 3000); // 3s
          }, 2000); // 2s
        }, 2000); // 2s
      }
    });

    socket.on('mark_unsold', ({ roomId }) => {
      console.log(`[ADMIN ACTION] Marking player as UNSOLD in Room: ${roomId}`);
      const state = activeRooms[roomId];
      if (state && state.current_player_id) {
        state.highest_bidder_id = null; // Ensure it's marked as unsold
        if (state.timer) clearTimeout(state.timer);
        processSoldUnsold(roomId);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });
};
