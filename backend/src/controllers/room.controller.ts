import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { AuthRequest } from '../middleware/auth.middleware';

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { code, password } = req.body;

    if (!code || !password) {
      return res.status(400).json({ error: 'Room code and password are required' });
    }

    const { data: existingRoom } = await supabase.from('rooms').select('id').eq('code', code).single();
    if (existingRoom) {
      return res.status(400).json({ error: 'Room code already exists' });
    }

    const { data: room, error: roomError } = await supabase.from('rooms').insert([{
      code,
      password,
      admin_id: userId,
      status: 'WAITING'
    }]).select().single();

    if (roomError || !room) {
      return res.status(500).json({ error: 'Failed to create room' });
    }

    await supabase.from('room_participants').insert([{
      room_id: room.id,
      user_id: userId,
      budget: 1500000000 // 150 Cr default
    }]);

    res.status(201).json(room);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const joinRoom = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { code, password } = req.body;

    if (!code || !password) {
      return res.status(400).json({ error: 'Room code and password are required' });
    }

    const { data: room } = await supabase.from('rooms').select('id, password').eq('code', code).single();
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.password !== password) {
      return res.status(401).json({ error: 'Incorrect room password' });
    }

    const { data: existingMembership } = await supabase.from('room_participants')
      .select('id')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .single();

    if (existingMembership) {
      return res.status(400).json({ error: 'Already joined this room' });
    }

    await supabase.from('room_participants').insert([{
      room_id: room.id,
      user_id: userId,
      budget: 1500000000 // 150 Cr default
    }]);

    res.json({ message: 'Joined room successfully', room });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getRoomDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params; // this is the room code in the old code
    
    // First find room by code
    const { data: room, error: roomErr } = await supabase.from('rooms')
      .select('*')
      .eq('code', roomId)
      .single();

    if (!room || roomErr) {
      return res.status(404).json({ error: 'Room not found' });
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
      .select('player_id, user_id, bought_for')
      .eq('room_id', room.id);
      
    const { data: unsold } = await supabase.from('unsold_players')
      .select('player_id')
      .eq('room_id', room.id);

    res.json({ 
       ...room, 
       roomUsers: roomUsers || [],
       rosters: rosters || [],
       unsold: unsold || []
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getRoomLeaderboard = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Join room_participants with auth_users to get the list of teams
    const { data: participants } = await supabase.from('room_participants')
      .select('user_id, budget, user:auth_users(name)')
      .eq('room_id', room.id);

    if (!participants) return res.json([]);

    // For each participant, calculate their total points from rosters joined with player_scores
    const leaderboard = await Promise.all(participants.map(async (p) => {
      const { data: userRoster } = await supabase.from('rosters')
        .select('player_id')
        .eq('room_id', room.id)
        .eq('user_id', p.user_id);

      let totalPoints = 0;
      if (userRoster && userRoster.length > 0) {
        const playerIds = userRoster.map(r => r.player_id);
        const { data: scores } = await supabase.from('player_scores')
          .select('points')
          .in('player_id', playerIds);
        
        if (scores) {
          totalPoints = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        }
      }

      return {
        user: { id: p.user_id, name: (p.user as any).name },
        budget: p.budget,
        totalPoints
      };
    }));

    // Sort by points descending
    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getScoreboard = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Detailed breakdown: Team -> list of players with their individual scores
    const { data: participants } = await supabase.from('room_participants')
      .select('user_id, user:auth_users(name)')
      .eq('room_id', room.id);

    if (!participants) return res.json({});

    const scoreboard = await Promise.all(participants.map(async (p) => {
      const { data: userRoster } = await supabase.from('rosters')
        .select('player:players(*)')
        .eq('room_id', room.id)
        .eq('user_id', p.user_id);

      const playersWithScores = await Promise.all((userRoster || []).map(async (r) => {
        const player = r.player as any;
        const { data: scores } = await supabase.from('player_scores')
          .select('points')
          .eq('player_id', player.id);
        
        const totalPlayerPoints = scores ? scores.reduce((sum, s) => sum + (s.points || 0), 0) : 0;
        return { ...player, score: totalPlayerPoints };
      }));

      const totalTeamPoints = playersWithScores.reduce((sum, p) => sum + p.score, 0);

      return {
        userName: (p.user as any).name,
        userId: p.user_id,
        players: playersWithScores,
        totalScore: totalTeamPoints
      };
    }));

    res.json(scoreboard);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const completeRoom = async (req: AuthRequest, res: Response) => {
   try {
     const { roomId } = req.params;
     const userId = req.user!.id;
     const { data: room } = await supabase.from('rooms').select('id, admin_id').eq('code', roomId).single();
     
     if (!room) return res.status(404).json({ error: 'Room not found' });
     if (room.admin_id !== userId) return res.status(403).json({ error: 'Only admin can complete room' });

     await supabase.from('rooms').update({ status: 'COMPLETED' }).eq('id', room.id);
     res.json({ message: 'Auction completed successfully' });
   } catch (error) {
     res.status(500).json({ error: 'Server error' });
   }
};

export const getRoomSquads = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { data: squads } = await supabase.from('rosters')
      .select(`
        *,
        player:players(*),
        user:auth_users(id, name, email)
      `)
      .eq('room_id', room.id);

    res.json(squads || []);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getAllPlayers = async (req: AuthRequest, res: Response) => {
  try {
    const { data: allPlayers } = await supabase.from('players').select('*');
    if (!allPlayers) return res.json([]);

    // Category sorting logic based on CSV roles: Batsman, Wicketkeeper, All-Rounder, Bowler
    const batters = allPlayers.filter(p => p.role === 'Batsman' || p.role === 'Wicketkeeper');
    const bowlers = allPlayers.filter(p => p.role === 'Bowler');
    const allRounders = allPlayers.filter(p => p.role === 'All-Rounder');

    // Jumble/Shuffle helper (Fisher-Yates style)
    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    // Combine in requested order: Batters -> Bowlers -> All-Rounders
    const orderedPlayers = [
      ...shuffle(batters),
      ...shuffle(bowlers),
      ...shuffle(allRounders)
    ];

    res.json(orderedPlayers);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

export const getMyRooms = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { data: participations } = await supabase.from('room_participants').select('room_id').eq('user_id', userId);
    if (!participations || participations.length === 0) return res.json([]);

    const roomIds = participations.map(p => p.room_id);
    const { data: rooms } = await supabase.from('rooms').select('*').in('id', roomIds).order('created_at', { ascending: false });

    const roomsWithPoints = await Promise.all((rooms || []).map(async (room) => {
      const { data: userRoster } = await supabase.from('rosters')
        .select('player_id')
        .eq('room_id', room.id)
        .eq('user_id', userId);

      let totalPts = 0;
      if (userRoster && userRoster.length > 0) {
        const playerIds = userRoster.map(r => r.player_id);
        const { data: scores } = await supabase.from('player_scores')
          .select('points')
          .in('player_id', playerIds);
        
        if (scores) {
          totalPts = scores.reduce((sum, s) => sum + (s.points || 0), 0);
        }
      }
      return { ...room, myPoints: totalPts };
    }));
    
    res.json(roomsWithPoints);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
export const getCompletedRooms = async (req: AuthRequest, res: Response) => {
  try {
    const { data: rooms } = await supabase.from('rooms')
      .select('*')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });
    
    res.json(rooms || []);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
export const leaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user!.id;
    
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomId).single();
    if (!room) return res.status(404).json({ error: 'Room not found' });

    await supabase.from('room_participants').delete().eq('room_id', room.id).eq('user_id', userId);
    res.json({ message: 'Left room successfully' });
  } catch (err: any) {
    res.status(500).json({ error: 'Server error' });
  }
};
