-- User Schema (if not using Supabase Auth natively for local testing, or mapping to it)
CREATE TABLE public.auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'WAITING', -- WAITING, AUCTION, OPTION_ROUND, COMPLETED
  admin_id UUID REFERENCES public.auth_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room Participants
CREATE TABLE public.room_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.auth_users(id) ON DELETE CASCADE,
  budget INTEGER DEFAULT 100000000, -- 100 Cr default budget
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Players (from CSV)
CREATE TABLE public.players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT,
  role TEXT,
  base_price TEXT,
  nationality_type TEXT
);

-- Bought Players Roster
CREATE TABLE public.rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.auth_users(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES public.players(id),
  bought_for INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Player Scores per match
CREATE TABLE public.player_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id TEXT NOT NULL,
  player_id INTEGER REFERENCES public.players(id),
  points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);
