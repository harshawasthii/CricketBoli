'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/api';
import { Megaphone, PlusCircle, LogIn, LogOut, AlertCircle, PlayCircle, Trophy, ChevronRight, X, User, BarChart3, ChevronDown, ChevronUp, Archive, Trash2 } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [roomCode, setRoomCode] = useState('');
  const [password, setPassword] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [myRooms, setMyRooms] = useState<any[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const trumpetAudioRef = useRef<HTMLAudioElement | null>(null);

  const playClick = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      // Silent fail
    }
  };

  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [scoreboard, setScoreboard] = useState<any[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<number | 'overall'>('overall');

  useEffect(() => {
    // Play trumpet on landing
    if (!trumpetAudioRef.current) {
      trumpetAudioRef.current = new Audio('/sfx/trumpet.mp3');
      trumpetAudioRef.current.volume = 0.1;
    }
    const playTrumpet = () => {
      trumpetAudioRef.current?.play().catch(() => {
        // Browser blocked auto-play, wait for interaction
        const startOnInteraction = () => {
          trumpetAudioRef.current?.play().catch(() => {});
          window.removeEventListener('click', startOnInteraction);
          window.removeEventListener('keydown', startOnInteraction);
        };
        window.addEventListener('click', startOnInteraction);
        window.addEventListener('keydown', startOnInteraction);
      });
    };
    playTrumpet();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (!token || !userData) {
      router.push('/login');
    } else {
      setUser(JSON.parse(userData));
      fetchWithAuth('/rooms/my').then(data => {
        setMyRooms(data);
      }).catch(err => {
        console.error('Failed to load rooms:', err);
        if (err.message === 'Unauthorized' || err.message === 'UNAUTHORIZED') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          router.push('/login');
        } else {
          setMyRooms([{ status: 'COMPLETED', code: `API_ERROR: ${err.message}` }]);
        }
      });
    }
  }, [router]);

  const handleJoinRoom = async () => {
    try {
      if (!roomCode.trim() || !password.trim()) return setError('Please enter room code and password');
      playClick();
      const data = await fetchWithAuth('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ code: roomCode.trim(), password: password.trim() }),
      });
      router.push(`/room/${roomCode}`);
    } catch (err: any) {
      if (err.message.includes('Already joined')) {
        router.push(`/room/${roomCode.trim()}`);
      } else {
        setError(err.message || 'Failed to join room');
      }
    }
  };

  const handleCreateRoom = async () => {
    try {
      if (!newRoomCode.trim() || !createPassword.trim()) return setError('Enter code and password');
      playClick();
      const data = await fetchWithAuth('/rooms/create', {
        method: 'POST',
        body: JSON.stringify({ code: newRoomCode.trim(), password: createPassword.trim() }),
      });
      router.push(`/room/${data.code}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    }
  };

  const openScoreboard = async (room: any) => {
    try {
      const data = await fetchWithAuth(`/rooms/${room.code}/scoreboard`);
      setScoreboard(data);
      setSelectedRoom(room);
    } catch (err: any) {
      setError('Failed to load scoreboard');
    }
  };

  const handleLeaveRoom = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (!window.confirm('Leave this room?')) return;
    try {
      playClick();
      await fetchWithAuth(`/rooms/${code}/leave`, { method: 'DELETE' });
      setMyRooms(prev => prev.filter(r => r.code !== code));
    } catch (err: any) {
      setError('Failed to leave room');
    }
  };
  const getMatchScore = (row: any, matchNo: number | 'overall') => {
    if (matchNo === 'overall') return row.totalScore;
    return row.players.reduce((sum: number, p: any) => sum + (p.matchScores?.find((m: any) => m.match_number === matchNo)?.points || 0), 0);
  };

  const getPlayerMatchScore = (p: any, matchNo: number | 'overall') => {
     if (matchNo === 'overall') return p.score;
     return p.matchScores?.find((m: any) => m.match_number === matchNo)?.points || 0;
  };

  const availableMatches = Array.from(new Set(
     (scoreboard || []).flatMap(row => row.players.flatMap((p: any) => (p.matchScores || []).map((ms: any) => ms.match_number)))
  )).sort((a: any, b: any) => a - b);

  if (!user) return <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center font-bold text-2xl gap-6 animate-pulse">
    <div className="w-32 h-32 bg-slate-800 rounded-[40px] flex items-center justify-center shadow-2xl overflow-hidden border border-slate-700">
       <img src="/logo.png" alt="CricketBoli Robot" className="w-full h-full object-cover" />
    </div>
    <span className="tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic">CricketBoli is warming up...</span>
  </div>;

  return (
    <div className="h-screen bg-[#0B1120] text-white font-sans selection:bg-blue-500/30 relative overflow-hidden flex flex-col">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      {/* Cricket Aesthetics - Left (Stumps) */}
      <svg viewBox="0 0 100 100" className="w-[400px] h-[400px] opacity-[0.05] text-blue-400 absolute bottom-[-10%] left-[-150px] rotate-12 pointer-events-none" fill="currentColor">
        <rect x="25" y="20" width="8" height="70" rx="4" />
        <rect x="46" y="20" width="8" height="70" rx="4" />
        <rect x="67" y="20" width="8" height="70" rx="4" />
        <rect x="26" y="15" width="22" height="4" rx="2" />
        <rect x="52" y="15" width="22" height="4" rx="2" />
      </svg>

      {/* Cricket Aesthetics - Right (Ball) */}
      <svg viewBox="0 0 100 100" className="w-[500px] h-[500px] opacity-[0.03] text-red-500 absolute top-[-5%] right-[-150px] -rotate-[30deg] pointer-events-none" fill="currentColor">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" />
        <path d="M 20 20 C 60 50, 20 80, 20 80 M 80 20 C 40 50, 80 80, 80 80" stroke="currentColor" strokeWidth="3" strokeDasharray="8 4" fill="none" />
      </svg>

      {/* Cricket Aesthetics - Center (Bat) */}
      <svg viewBox="0 0 100 100" className="w-[600px] h-[600px] opacity-[0.02] text-slate-400 absolute top-[30%] left-1/2 -translate-x-1/2 -rotate-[45deg] pointer-events-none" fill="currentColor">
        <path d="M 40 10 L 60 10 L 60 40 L 65 40 L 65 95 L 35 95 L 35 40 L 40 40 Z" />
      </svg>

      {/* Pitch Pattern Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #3b82f6 1px, transparent 0)', backgroundSize: '40px 40px' }} />

      <nav className="border-b border-white/5 bg-slate-900/40 backdrop-blur-xl relative z-[100] h-14 sm:h-20">
        <div className="w-full flex items-center justify-between h-full px-3 sm:px-8">
          <div className="flex items-center gap-2 sm:gap-4 group cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-9 h-9 sm:w-14 sm:h-14 bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden relative ring-1 ring-white/10 group-hover:ring-amber-500/30 transition-all">
              <img src="/logo.png" alt="CricketBoli Mascot" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl sm:text-4xl font-black bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent tracking-tighter italic leading-none pr-1">
                CricketBoli
              </h1>
              <span className="text-[8px] sm:text-[10px] text-amber-500/60 font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-none mt-0.5 sm:mt-1 ml-1 sm:ml-1.5 drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]">Premium Drafts</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-6 bg-slate-800/50 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border border-slate-700/50">
            <span className="text-slate-300 font-bold hidden sm:inline-block">{user.name}</span>
            <div className="hidden sm:block w-px h-6 bg-slate-700"></div>
            <button 
              onClick={() => { localStorage.clear(); router.push('/login'); }}
              className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-400 hover:text-rose-400 transition-colors font-semibold"
            >
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span><span className="sm:hidden">Exit</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6 relative z-10 overflow-y-auto overflow-x-hidden">
        {error && (
          <div className="mb-6 max-w-2xl mx-auto w-full p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-center text-sm font-bold flex items-center justify-center gap-2 animate-pulse shrink-0">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8 lg:h-full lg:min-h-0">
          
          {/* Column 1: Core Actions (ENLARGED) */}
          <div className="lg:col-span-5 flex flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scrollbar lg:pr-4 pb-4 sm:pb-6">
            <div className="text-left animate-in slide-in-from-left-8 duration-700 mb-5 sm:mb-10 mt-2 sm:mt-4">
              <h2 className="text-3xl sm:text-5xl xl:text-7xl font-black text-white mb-3 sm:mb-6 tracking-tight drop-shadow-lg leading-tight w-full">
                Enter your <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent italic">Arena</span>
              </h2>
              <p className="text-sm sm:text-lg text-slate-400 font-medium leading-relaxed max-w-xl">
                Create a private room to act as the Auctioneer, or join an existing draft to build your dream IPL squad against friends.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
              {/* Join Room Card */}
              <div className="bg-slate-900/40 backdrop-blur-xl border-2 border-slate-700/50 rounded-2xl sm:rounded-3xl p-4 sm:p-8 hover:bg-slate-800/60 transition-all duration-300 hover:shadow-[0_0_40px_rgba(59,130,246,0.1)] group relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all" />
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-6 border border-blue-500/30 group-hover:scale-110 transition-transform">
                  <LogIn className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mb-3 sm:mb-4">Join Room</h2>
                <input
                    type="text"
                    placeholder="Room Code"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 text-white text-base sm:text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 mb-2"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 text-white text-base sm:text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 mb-3 sm:mb-4"
                  />
                  <button onClick={handleJoinRoom} className="w-full bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 sm:px-5 sm:py-4 rounded-xl sm:rounded-2xl font-black shadow-xl active:scale-95 transition-all text-base sm:text-lg tracking-widest">JOIN</button>
              </div>

              {/* Create Room Card */}
              <div className="bg-slate-900/40 backdrop-blur-xl border-2 border-slate-700/50 rounded-2xl sm:rounded-3xl p-4 sm:p-8 hover:bg-slate-800/60 transition-all duration-300 hover:shadow-[0_0_40px_rgba(99,102,241,0.1)] group relative overflow-hidden flex flex-col">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-all" />
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-6 border border-indigo-500/30 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mb-3 sm:mb-4">Create Room</h2>
                <input
                    type="text"
                    placeholder="New Code"
                    value={newRoomCode}
                    onChange={(e) => setNewRoomCode(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 text-white text-base sm:text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 mb-2"
                  />
                  <input
                    type="password"
                    placeholder="Set Password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-4 text-white text-base sm:text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-600 mb-3 sm:mb-4"
                  />
                  <button onClick={handleCreateRoom} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 sm:px-5 sm:py-4 rounded-xl sm:rounded-2xl font-black shadow-xl active:scale-95 transition-all text-base sm:text-lg tracking-widest">CREATE</button>
              </div>
            </div>
          </div>

          {/* Column 2: Your Active Auctions (SHRUNK) */}
          <div className="lg:col-span-4 flex flex-col lg:h-full lg:min-h-0">
             <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col lg:h-full lg:min-h-0">
                <h3 className="text-base sm:text-lg font-black text-white mb-3 sm:mb-6 uppercase tracking-widest flex items-center gap-2 shrink-0">
                  <Trophy className="w-5 h-5 text-amber-400" /> Current Battles
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 sm:space-y-4">
                  {(!myRooms || myRooms.filter(r => r.status !== 'COMPLETED' && r.status !== 'ENDED').length === 0) ? (
                    <div className="h-28 sm:h-40 flex flex-col items-center justify-center opacity-40 border-2 border-dashed border-slate-800 rounded-2xl sm:rounded-3xl p-4 text-center">
                      <p className="text-slate-500 text-xs font-bold italic leading-relaxed">No active <br/> auctions.</p>
                    </div>
                  ) : (
                    myRooms.filter(r => r.status !== 'COMPLETED' && r.status !== 'ENDED').map(room => (
                      <div key={room.id} onClick={() => router.push(`/room/${room.code}`)} className="group cursor-pointer bg-slate-800/40 hover:bg-slate-700/60 border border-slate-700/50 p-3 sm:p-4 rounded-xl transition-all shadow-md flex justify-between items-center">
                        <div className="min-w-0 pr-3 sm:pr-4">
                          <h4 className="text-lg sm:text-xl font-black text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight truncate">{room.code}</h4>
                        </div>
                        <div className="text-right shrink-0 flex items-center gap-2 sm:gap-3">
                          <div className="text-right">
                            <p className="text-[10px] text-amber-400 font-black leading-none">{room.myPoints || 0} PTS</p>
                          </div>
                          <button onClick={(e) => handleLeaveRoom(e, room.code)} className="p-1.5 bg-slate-800/60 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-lg transition-all border border-slate-700/50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>

          {/* Column 3: Hall of Fame (SHRUNK) */}
          <div className="lg:col-span-3 flex flex-col lg:h-full lg:min-h-0">
             <div className="bg-slate-900/40 backdrop-blur-xl border border-amber-500/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col lg:h-full lg:min-h-0 group/hof">
                <h3 className="text-lg sm:text-xl font-black text-white mb-3 sm:mb-6 uppercase tracking-widest flex items-center gap-2 sm:gap-3 shrink-0">
                  <Archive className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" /> Hall of Fame
                </h3>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 sm:space-y-4">
                  {(myRooms.filter(r => r.status === 'COMPLETED' || r.status === 'ENDED').length === 0) ? (
                    <div className="h-28 sm:h-40 flex flex-col items-center justify-center opacity-40 border-2 border-dashed border-slate-800 rounded-2xl sm:rounded-3xl p-4 text-center">
                      <p className="text-slate-500 text-xs font-bold italic leading-relaxed">No archived <br/> rooms.</p>
                    </div>
                  ) : (
                    myRooms.filter(r => r.status === 'COMPLETED' || r.status === 'ENDED').map((room) => (
                      <div key={room.id} onClick={() => openScoreboard(room)} className="group/card cursor-pointer bg-slate-800/30 hover:bg-amber-500/5 border border-amber-500/10 p-3 sm:p-5 rounded-xl sm:rounded-2xl transition-all relative overflow-hidden">
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500/0 group-hover/card:bg-amber-500/20 transition-all blur-md" />
                        <div className="flex justify-between items-start mb-2 sm:mb-4">
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-black tracking-widest uppercase border border-amber-500/20">Archived</span>
                          <span className="text-[10px] text-slate-500 font-bold">{new Date(room.created_at).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-black text-white group-hover/card:text-amber-400 transition-colors uppercase tracking-tight truncate">{room.code}</h4>
                        <div className="mt-3 pt-3 sm:mt-4 sm:pt-4 border-t border-slate-700/50 flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">
                           <span>Verified Result</span>
                           <ChevronRight className="w-3 h-3 group-hover/card:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Scorecard Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={() => setSelectedRoom(null)} />
          <div className="bg-slate-900 border border-slate-700 rounded-[32px] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative z-[101] shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300">
             
             {/* Modal Header */}
             <div className="p-8 border-b border-slate-800 flex justify-between items-start bg-slate-800/20">
               <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Trophy className="w-8 h-8 text-amber-400" />
                    <h2 className="text-4xl font-black text-white uppercase tracking-tight">Auction <span className="text-emerald-400">Scorecard</span></h2>
                  </div>
                  <p className="text-slate-400 font-bold ml-11 uppercase tracking-widest text-sm italic">{selectedRoom.code} &bull; Final Standings</p>
               </div>
               <button onClick={() => setSelectedRoom(null)} className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                 <X className="w-6 h-6" />
               </button>
             </div>

             {/* Modal Content */}
             <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent)]">
                
                {/* Room Leaderboard in Modal */}
                <div className="space-y-4">
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                     <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" /> Room Leaderboard
                     </h3>
                     {availableMatches.length > 0 && (
                       <div className="flex flex-wrap gap-2">
                         <button 
                           onClick={() => setSelectedMatch('overall')}
                           className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${selectedMatch === 'overall' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800'}`}
                         >
                           Overall
                         </button>
                         {availableMatches.map((m: any) => (
                           <button 
                             key={m}
                             onClick={() => setSelectedMatch(m)}
                             className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${selectedMatch === m ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:bg-slate-800'}`}
                           >
                             Match {m}
                           </button>
                         ))}
                       </div>
                     )}
                   </div>
                   <div className="grid grid-cols-1 gap-4">
                      {[...scoreboard].sort((a,b)=>getMatchScore(b, selectedMatch) - getMatchScore(a, selectedMatch)).map((row, idx) => (
                        <div key={row.userId} className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/20 transition-all hover:bg-slate-800/40">
                           <div 
                             onClick={() => setExpandedUser(expandedUser === row.userId ? null : row.userId)}
                             className="p-5 flex items-center justify-between cursor-pointer"
                           >
                              <div className="flex items-center gap-6">
                                 <span className={`text-3xl font-black italic items-center justify-center flex w-12 h-12 rounded-xl border-2 shrink-0 ${idx === 0 ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' : idx === 1 ? 'text-slate-300 border-slate-400/30 bg-slate-400/10' : idx === 2 ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' : 'text-slate-600 border-slate-700/50 bg-slate-900/50'}`}>
                                   {idx + 1}
                                 </span>
                                 <div className="min-w-0">
                                    <p className="text-xl font-black text-white uppercase truncate">{row.userName}</p>
                                    <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase mt-0.5">{row.players.length} PLRS BOUGHT</p>
                                 </div>
                              </div>
                              <div className="flex items-center gap-8">
                                 <div className="text-right hidden sm:block">
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Power</p>
                                    <p className={`text-4xl font-black tracking-tighter ${idx === 0 ? 'text-emerald-400' : 'text-slate-200'}`}>
                                      {getMatchScore(row, selectedMatch)}
                                    </p>
                                 </div>
                                 <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 group-hover:bg-slate-700 transition-colors">
                                   {expandedUser === row.userId ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                                 </div>
                              </div>
                           </div>

                           {/* Squad Dropdown Details */}
                           {expandedUser === row.userId && (
                             <div className="px-5 pb-5 pt-2 border-t border-slate-800/50 animate-in slide-in-from-top-4 duration-300">
                                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
                                   {row.players.map((p: any) => (
                                     <div key={p.id} className="p-3 bg-slate-950/40 border border-slate-700/30 rounded-xl group/card flex flex-col h-full hover:border-emerald-500/20 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                           <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter shrink-0">{p.role?.split(' ')[0]}</span>
                                           <span className="text-xs font-black text-emerald-400">+{getPlayerMatchScore(p, selectedMatch)}</span>
                                        </div>
                                        <p className="text-xs font-bold text-slate-200 mt-auto truncate">{p.name}</p>
                                        <p className="text-[9px] text-slate-500 font-medium uppercase mt-0.5">{p.team}</p>
                                     </div>
                                   ))}
                                </div>
                             </div>
                           )}
                        </div>
                      ))}
                   </div>
                </div>

             </div>
          </div>
        </div>
      )}

      {/* Admin Link Base */}
      <a href="/admin" className="absolute bottom-4 right-6 text-xs text-slate-600 hover:text-slate-400 font-bold uppercase tracking-widest transition-colors z-50">
        Admin Gateway
      </a>
    </div>
  );
}
