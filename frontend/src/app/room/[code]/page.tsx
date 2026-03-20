'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { fetchWithAuth, SOCKET_URL } from '@/lib/api';
import { Trophy, History, Users, Wallet, AlertCircle, Megaphone, CheckCircle2, Play, Pause, ChevronRight } from 'lucide-react';

// Removed global let socket


export default function RoomPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [roomDetails, setRoomDetails] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  
  const [auctionState, setAuctionState] = useState<any>({ current_player_id: null, current_bid: 0, highest_bidder_id: null, timer: null, status: 'IDLE' });
  const [bidAmount, setBidAmount] = useState<number | string>('');
  const [soldEvents, setSoldEvents] = useState<any[]>([]);
  const [bidduMessages, setBidduMessages] = useState<{id: number, text: string}[]>([]);
  const [errorToast, setErrorToast] = useState('');
  const [optionRoundActive, setOptionRoundActive] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastBidTime = useRef<number>(0);
  const socketRef = useRef<Socket | null>(null);

  // Sound Effects System
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  const playSfx = (type: 'bid' | 'sold' | 'click' | 'warning') => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      if (type === 'click') {
        // Soft, brief high-freq click
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.07);
      }

      if (type === 'bid') {
        // Short upward tick — confirms the bid
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.07);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.13);
      }

      if (type === 'sold') {
        // Cascading coin chime — 4 high bells in quick succession
        const notes = [1047, 1319, 1568, 2093]; // C6, E6, G6, C7
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          const t = ctx.currentTime + i * 0.10;
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.0, t);
          gain.gain.linearRampToValueAtTime(0.35, t + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          osc.start(t);
          osc.stop(t + 0.56);
        });
      }
      if (type === 'warning') {
        // Descending subtle tone — going once/twice/thrice
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(340, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.23);
      }
    } catch (e) {
      // Silent fail — audio never breaks the UI
    }
  };

  const addBidduMessage = (text: string) => {
    setBidduMessages(prev => [...prev.slice(-10), { id: Date.now(), text }]);
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [bidduMessages]);

  useEffect(() => {
    const userDataStr = localStorage.getItem('user');
    if (!userDataStr) {
      router.push('/login');
      return;
    }
    const userData = JSON.parse(userDataStr);
    setUser(userData);

    const initRoom = async () => {
      try {
        const [details, lead, allPlayers] = await Promise.all([
          fetchWithAuth(`/rooms/${params.code}`),
          fetchWithAuth(`/rooms/${params.code}/leaderboard`),
          fetchWithAuth(`/rooms/players/all`)
        ]);
        setRoomDetails(details);
        setLeaderboard(lead);
        setPlayers(allPlayers);
        
        const rebuiltEvents: any[] = [];
        if (details.rosters) {
          details.rosters.forEach((r: any) => {
            rebuiltEvents.push({ playerId: r.player_id, userId: r.user_id, amount: r.bought_for, isUnsold: false });
          });
        }
        if (details.unsold) {
          details.unsold.forEach((u: any) => {
            rebuiltEvents.push({ playerId: u.player_id, amount: 0, isUnsold: true });
          });
        }
        setSoldEvents(rebuiltEvents);
      } catch (err: any) {
        setErrorToast('Connection Error. Re-syncing...');
      }
    };

    initRoom();
    const handleFocus = () => initRoom();
    window.addEventListener('focus', handleFocus);

    const s = io(SOCKET_URL, { reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000 });
    socketRef.current = s;

    s.on('connect', () => {
      s.emit('join_room', { roomId: params.code, userId: userData.id });
      initRoom(); // Full state refresh on connect/reconnect
    });

    s.on('room_update', (data) => {
      if (data.state) {
        setAuctionState((prev: any) => {
          const newStatus = data.state.status;
          if (
            newStatus !== prev.status &&
            (newStatus === 'ONCE' || newStatus === 'TWICE' || newStatus === 'THRICE')
          ) {
            playSfx('warning');
          }
          return data.state;
        });
      }
    });

    s.on('biddu_message', (data) => addBidduMessage(data.message));

    s.on('auction_started', (data) => {
      setAuctionState((prev: any) => ({ ...prev, current_player_id: data.player.id, current_bid: data.base_price, highest_bidder_id: null, status: 'IDLE' }));
      setBidAmount(data.base_price);
    });

    s.on('bid_placed', (data) => {
      setAuctionState((prev: any) => ({ ...prev, current_bid: data.amount, highest_bidder_id: data.userId }));
      playSfx('bid');
    });

    s.on('player_sold_success', (data) => {
      setSoldEvents(prev => [...prev, data]);
      setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
      playSfx('sold');
      setTimeout(initRoom, 500);
    });

    s.on('player_unsold', (data) => {
      setSoldEvents(prev => [...prev, { playerId: data.playerId, amount: 0, isUnsold: true }]);
      setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
    });

    s.on('error', (data) => {
      setErrorToast(data.message);
      setTimeout(() => setErrorToast(''), 4000);
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      s.disconnect();
    };
  }, [params.code, router]);

  const handleStartAuction = (playerId: number) => {
    playSfx('click');
    socketRef.current?.emit('start_auction', { roomId: params.code, playerId });
  };

  const handlePlaceBid = (forcedAmount?: number | any) => {
    if (Date.now() - lastBidTime.current < 500) return;
    lastBidTime.current = Date.now();

    let amt = typeof forcedAmount === 'number' ? forcedAmount : Number(bidAmount);
    if (!amt) {
       amt = auctionState.highest_bidder_id ? auctionState.current_bid + 100000 : auctionState.current_bid;
    }

    if (auctionState.highest_bidder_id && amt <= auctionState.current_bid) {
      setErrorToast('Bid must be higher than current bid.');
      return;
    }
    playSfx('click');
    socketRef.current?.emit('place_bid', { roomId: params.code, userId: user.id, amount: amt });
    setBidAmount('');
  };

  const handleCalculateScores = async () => {
    try {
      const res = await fetchWithAuth(`/admin/update-match/match_1_mock`, { method: 'POST' });
      setErrorToast(res?.message || 'Scores calculated!');
    } catch (err: any) {
      setErrorToast(err?.message || 'Error calculating scores');
    }
  };

  const handleMarkUnsold = () => {
     if (confirm('Mark this player as UNSOLD?')) {
       socketRef.current?.emit('mark_unsold', { roomId: params.code });
     }
  };
  
  const handlePause = () => socketRef.current?.emit('pause_auction', { roomId: params.code });
  const handleResume = () => socketRef.current?.emit('resume_auction', { roomId: params.code });

  const handleCompleteAuction = async () => {
    if (confirm('Are you sure the auction is over? This will finalize all squads for scoring.')) {
      try {
        await fetchWithAuth(`/rooms/${params.code}/complete`, { method: 'POST' });
        router.push('/');
      } catch (err: any) {
        setErrorToast(err.message);
      }
    }
  };

  const isAdmin = roomDetails?.admin_id === user?.id;
  const currentPlayer = players?.find(p => p.id === auctionState.current_player_id);
  const myMembership = roomDetails?.roomUsers?.find((r: any) => r.user_id === user?.id);

  const formatPrice = (amt: number) => {
    if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(2)} Cr`;
    if (amt >= 100000) return `₹${(amt / 100000).toFixed(2)} L`;
    return `₹${amt}`;
  };

  // Get available players list
  const availablePlayers = players ? players.filter(p => optionRoundActive 
    ? soldEvents.find(s => s.playerId === p.id && s.isUnsold) 
    : !soldEvents.find(s => s.playerId === p.id)
  ) : [];

  const myBoughtPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && s.userId === user?.id && !s.isUnsold));
  const myOverseasCount = myBoughtPlayers.filter(p => p.nationality_type?.toLowerCase() === 'overseas').length;

  const handleStartNextPlayer = () => {
    if (availablePlayers.length > 0) {
      handleStartAuction(availablePlayers[0].id);
    } else {
      setErrorToast('No players left in this round!');
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAdmin && isAutoMode && !auctionState.current_player_id && availablePlayers.length > 0) {
      timer = setTimeout(() => {
        handleStartNextPlayer();
      }, 1500);
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isAutoMode, auctionState.current_player_id, availablePlayers.length]);

  if (!roomDetails || !user) return (
    <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center font-bold text-2xl gap-8">
      <div className="w-32 h-32 bg-slate-800 rounded-[40px] flex items-center justify-center shadow-2xl overflow-hidden border border-slate-700 animate-pulse">
         <img src="/logo.png" alt="CricketBoli Robot" className="w-full h-full object-cover" />
      </div>
      <div className="animate-pulse tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic">Entering CricketBoli Arena...</div>
      {errorToast && <div className="text-red-500 text-sm mt-4 bg-red-500/10 px-4 py-2 rounded border border-red-500">{errorToast}</div>}
    </div>
  );

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#0B1120] text-white font-sans p-4 md:p-6 lg:p-8 relative flex flex-col items-center">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

      {errorToast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-md text-white px-8 py-4 rounded-full shadow-[0_0_30px_rgba(220,38,38,0.4)] z-50 flex items-center gap-3 animate-bounce border border-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="font-bold">{errorToast}</span>
        </div>
      )}

      {/* Top Header Section */}
      <div className="w-full max-w-screen-2xl bg-slate-900/40 backdrop-blur-xl border-b border-white/5 px-8 h-20 flex items-center justify-between shrink-0 relative z-[100] rounded-3xl mb-6 shadow-2xl">
          <div className="flex items-center gap-4 group cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-14 h-14 bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl relative">
              <img src="/logo.png" alt="CricketBoli Mascot" className="w-full h-full object-cover rounded-xl" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-3xl font-black bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tighter italic leading-none">
                CricketBoli
              </h1>
              <span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mt-1 ml-1 leading-none">Arena &bull; {params.code}</span>
            </div>
          </div>

          <div className="flex items-center gap-6 bg-slate-800/80 px-6 py-3 rounded-2xl border border-white/5 shadow-2xl">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
              <Wallet className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black mb-0.5">My Budget</p>
              <p className="text-2xl font-black text-white drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                {formatPrice(myMembership?.budget || 0)}
              </p>
            </div>
          </div>
      </div>

      <div className="w-full max-w-screen-2xl flex-1 lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 lg:min-h-0">
        
        {/* Left Sidebar: Participants & All Squads */}
        <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:min-h-0 pb-2 order-2 lg:order-1">
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-6 border border-slate-700/50 shadow-[0_0_20px_rgba(0,0,0,0.2)] flex-1 flex flex-col min-h-0">
             <h3 className="text-white font-black mb-6 uppercase tracking-widest text-[10px] xl:text-xs flex items-center gap-2">
               <Users className="w-4 h-4 xl:w-5 xl:h-5 text-blue-400" /> Standings & Squads
             </h3>
             <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
               {leaderboard.map((member: any) => {
                 const memberPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && s.userId === member.user.id && !s.isUnsold));
                 return (
                   <div key={member.user.id} className={`p-4 rounded-2xl border transition-all ${member.user.id === user?.id ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/20 shadow-[0_0_15px_rgba(79,70,229,0.1)]' : 'bg-slate-800/40 border-slate-700/50 hover:bg-slate-800/60'}`}>
                     <div className="flex justify-between items-start mb-2 group">
                       <div className="min-w-0 flex-1">
                         <p className="text-xs xl:text-sm font-black text-white flex items-center gap-1.5 truncate">
                           {member.user.name}
                           {member.user.id === roomDetails.admin_id && <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-bold border border-amber-500/10 shrink-0">ADMIN</span>}
                         </p>
                         <p className="text-[10px] text-emerald-400 font-bold mt-0.5">{formatPrice(member.budget)}</p>
                       </div>
                       <div className="bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-700 text-[9px] font-black text-slate-500 group-hover:text-slate-300 transition-colors ml-2 shrink-0">
                         {memberPlayers.length}/25
                       </div>
                     </div>
                     
                     {memberPlayers.length > 0 && (
                       <div className="flex flex-wrap gap-1 mt-3">
                         {memberPlayers.map(p => (
                           <span key={p.id} title={p.name} className="px-1.5 py-0.5 bg-slate-900/80 border border-slate-700/50 rounded-[4px] text-[8px] text-slate-400 font-bold truncate max-w-[65px] hover:text-white hover:border-slate-500 transition-all cursor-default">
                             {p.name.split(' ').pop()}
                           </span>
                         ))}
                       </div>
                     )}
                   </div>
                 )
               })}
             </div>
          </div>
        </div>

        {/* Center Column: Biddu & Main Arena */}
        <div className="lg:col-span-6 flex flex-col gap-6 lg:h-full lg:min-h-0 pb-2 order-1 lg:order-2">
          
          <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 backdrop-blur-md border border-blue-500/30 rounded-3xl p-6 shadow-[0_0_40px_rgba(59,130,246,0.1)] relative overflow-hidden shrink-0">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-blue-400 shrink-0 shadow-[0_0_20px_rgba(59,130,246,0.2)] overflow-hidden">
                <img src="/logo.png" alt="CricketBoli AI" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-blue-400 font-black mb-1 flex items-center gap-2 whitespace-nowrap overflow-hidden text-ellipsis">
                  CRICKETBOLI AI
                  <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] tracking-widest uppercase rounded-full border border-blue-500/30 hidden sm:inline-block">Bot</span>
                </h3>
                <div className="h-[70px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                  {bidduMessages.map((msg, idx) => (
                    <div key={msg.id} className={`text-xl transition-all duration-300 ${idx === bidduMessages.length - 1 ? 'text-white font-bold translate-x-1' : 'text-slate-400 scale-[0.98] origin-left opacity-70 border-l border-slate-600 pl-2'}`}>
                      {msg.text}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-700/50 rounded-3xl p-4 md:p-6 flex-1 w-full flex flex-col items-center justify-center shadow-2xl relative overflow-hidden lg:min-h-[450px]">
            {currentPlayer ? (
              <div className="text-center w-full max-w-3xl animate-in zoom-in-95 duration-500 relative z-10 flex flex-col items-center justify-between h-full py-2">
                
                {/* Top: Player Information */}
                <div className="flex flex-col items-center justify-start flex-shrink-0 w-full mb-2">
                  <div className="flex justify-center gap-3 mb-2">
                    <span className="px-4 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold tracking-widest border border-indigo-500/30 uppercase">
                      {currentPlayer.role}
                    </span>
                    <span className={`px-4 py-1 rounded-full text-xs font-bold tracking-widest border uppercase ${currentPlayer.nationality_type?.toLowerCase() === 'overseas' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                      {currentPlayer.nationality_type}
                    </span>
                  </div>
                  <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white mb-2 tracking-tight drop-shadow-md leading-tight text-wrap px-2 break-words text-center mt-1">
                    {currentPlayer.name}
                  </h2>
                  <p className="text-sm border border-slate-700 bg-slate-800/50 px-5 py-1.5 rounded-full text-slate-300 font-bold mb-2">Base Price: {currentPlayer.base_price}</p>
                </div>

                {/* Middle/Bottom: Bidding Area */}
                <div className={`w-full max-w-2xl bg-slate-950/80 rounded-[28px] p-5 md:p-6 border ${auctionState.highest_bidder_id === user.id ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.2)]' : 'border-slate-800 shadow-inner'} relative overflow-hidden transition-all duration-500 flex flex-col justify-center flex-shrink-0 mt-auto`}>
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-[50px] mix-blend-screen pointer-events-none" />
                  
                  {auctionState.status === 'PAUSED' && (
                    <div className="flex justify-center w-full mb-3">
                      <div className="bg-amber-500/20 text-amber-400 px-5 py-1.5 rounded-full font-black tracking-widest animate-pulse border border-amber-500/30 text-xs z-20 shadow-lg relative">
                        PAUSED
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col items-center justify-center">
                    <p className="text-[11px] text-amber-500/80 mb-1 uppercase tracking-widest font-black text-center">Current Highest Bid</p>
                    <p className="text-4xl md:text-5xl lg:text-6xl font-black text-amber-400 mb-3 drop-shadow-[0_0_20px_rgba(251,191,36,0.2)] tracking-wider break-all leading-none w-full truncate whitespace-normal text-center">
                      {formatPrice(auctionState.current_bid)}
                    </p>
                    
                    <div className="flex justify-center w-full mb-4 md:mb-6 h-8 items-center relative z-10">
                      {auctionState.highest_bidder_id ? (
                        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-xl shadow-sm">
                          <CheckCircle2 className="w-4 h-4 text-amber-400" />
                          <span className="text-amber-300 font-bold text-sm">
                            by {roomDetails.roomUsers.find((r:any)=>r.user.id === auctionState.highest_bidder_id)?.user.name || 'Unknown'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-500 font-bold px-4 py-1.5 bg-slate-900/80 rounded-xl border border-slate-800 text-center text-xs tracking-wide uppercase shadow-sm">Waiting for opening bid</div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 max-w-lg mx-auto w-full relative z-10 mt-2">
                    {!auctionState.highest_bidder_id ? (
                      <button 
                        onClick={() => handlePlaceBid(auctionState.current_bid)}
                        disabled={auctionState.status === 'PAUSED'}
                        className="bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-orange-950 px-8 rounded-2xl font-black text-xl md:text-2xl shadow-[0_0_30px_rgba(245,158,11,0.3)] hover:shadow-[0_0_40px_rgba(245,158,11,0.5)] hover:-translate-y-1 transition-all disabled:opacity-50 disabled:hover:translate-y-0 w-full h-[60px] md:h-[68px]"
                      >
                        OPEN BID ({formatPrice(auctionState.current_bid)})
                      </button>
                    ) : (
                      <div className="grid grid-cols-5 gap-2 w-full">
                        {[
                          { label: '+10L', val: 1000000 },
                          { label: '+30L', val: 3000000 },
                          { label: '+50L', val: 5000000 },
                          { label: '+75L', val: 7500000 },
                          { label: '+1CR', val: 10000000 },
                        ].map((inc) => (
                          <button
                            key={inc.label}
                            onClick={() => handlePlaceBid(auctionState.current_bid + inc.val)}
                            disabled={auctionState.status === 'PAUSED'}
                            className="bg-slate-900 border-2 border-slate-700/80 hover:border-amber-400 text-white hover:text-amber-400 rounded-xl py-3 font-black text-xs sm:text-sm md:text-base transition-all disabled:opacity-50 shadow-inner hover:-translate-y-0.5"
                          >
                            {inc.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 relative z-10 w-full flex flex-col items-center justify-center h-full min-h-[450px]">
                <div className="w-24 h-24 bg-slate-800/30 rounded-full flex items-center justify-center mb-6 border border-slate-700/50 relative overflow-hidden flex-shrink-0 shadow-inner">
                  <div className="absolute inset-0 bg-blue-500/5 animate-pulse" />
                  <History className="w-10 h-10 text-slate-600" />
                </div>
                <h2 className="text-3xl font-black mb-2 text-slate-300 tracking-tight flex-shrink-0">Awaiting Next Player</h2>
                <p className="text-slate-500 font-medium text-base flex-shrink-0">Sit tight. Bidding is currently paused.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:min-h-0 pb-2 order-3">
          
          {/* Room Controls (Only Admin) */}
          {isAdmin && (
            <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-6 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)] shrink-0 flex flex-col">
              <h3 className="text-emerald-400 font-black mb-4 uppercase tracking-widest text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Room Controls
              </h3>
              
              {!currentPlayer ? (
                <>
                  <div className="flex gap-4">
                    <button 
                      onClick={handleStartNextPlayer}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-2 xl:px-4 py-4 rounded-2xl font-black transition-all shadow-lg hover:-translate-y-0.5 flex items-center justify-center gap-1 xl:gap-2"
                    >
                      Next <ChevronRight className="w-5 h-5 hidden sm:inline-block" />
                    </button>
                    <button
                      onClick={() => setIsAutoMode(!isAutoMode)}
                      title="Automatically pull the next player after a 4-second delay"
                      className={`px-4 xl:px-6 py-4 rounded-2xl font-black transition-all shadow-lg hover:-translate-y-0.5 flex items-center justify-center border-2 ${isAutoMode ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                    >
                      {isAutoMode ? 'AUTO ON' : 'AUTO OFF'}
                    </button>
                  </div>
                  {availablePlayers.length === 0 ? (
                    <button 
                      onClick={handleCompleteAuction}
                      className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-4 rounded-2xl font-black transition-all shadow-[0_0_30px_rgba(79,70,229,0.3)] flex items-center justify-center gap-2 animate-bounce"
                    >
                       <Trophy className="w-5 h-5" /> COMPLETE AUCTION
                    </button>
                  ) : (
                    <div className="text-center mt-4 text-slate-500 text-sm font-medium">
                      {availablePlayers.length} players remaining to be auctioned.
                    </div>
                  )}
                  
                  {/* Option Round Reveal - ONLY when main players are 0 */}
                  {players.filter(p => !soldEvents.find(s=>s.playerId === p.id)).length === 0 && !optionRoundActive && (
                    <button 
                      onClick={() => setOptionRoundActive(true)}
                      className="w-full mt-4 bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500 hover:text-slate-900 px-4 py-3 rounded-xl font-black tracking-widest uppercase transition-all"
                    >
                      Start Option Round
                    </button>
                  )}
                  {optionRoundActive && (
                    <div className="mt-4 text-center text-amber-500 font-bold text-sm bg-amber-500/10 py-2 rounded-lg border border-amber-500/20">
                      Option Round Active
                    </div>
                  )}
                </>
              ) : (
                <div className="flex gap-2">
                  {auctionState.status !== 'PAUSED' ? (
                    <button 
                      onClick={handlePause}
                      className="flex-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500 hover:text-orange-950 px-2 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 text-[10px] xl:text-xs tracking-wider"
                    >
                      <Pause className="w-4 h-4" /> PAUSE
                    </button>
                  ) : (
                    <button 
                      onClick={handleResume}
                      className="flex-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-emerald-950 px-2 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 text-[10px] xl:text-xs tracking-wider"
                    >
                      <Play className="w-4 h-4" /> RESUME
                    </button>
                  )}
                  <button 
                    onClick={handleMarkUnsold}
                    className="flex-1 bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white px-2 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 text-[10px] xl:text-xs tracking-wider"
                  >
                     MARK UNSOLD
                  </button>
                </div>
              )}

            </div>
          )}

          {/* Your Squad/Team Section */}
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-6 border border-indigo-500/20 shadow-[0_0_20px_rgba(79,70,229,0.05)] shrink-0 flex flex-col">
            <h3 className="text-indigo-400 font-black mb-4 uppercase tracking-widest text-sm flex items-center gap-2">
              <Users className="w-4 h-4" /> Your Team Summary
            </h3>
            
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="bg-slate-800/40 p-2 xl:p-3 rounded-2xl border border-slate-700/50 shadow-inner">
                <p className="text-[9px] xl:text-[10px] text-slate-500 uppercase font-black mb-1">Total</p>
                <p className="text-lg xl:text-xl font-black text-white leading-none">{myBoughtPlayers.length}</p>
              </div>
              <div className="bg-slate-800/40 p-2 xl:p-3 rounded-2xl border border-slate-700/50 shadow-inner">
                <p className="text-[9px] xl:text-[10px] text-slate-500 uppercase font-black mb-1">Slots</p>
                <p className="text-lg xl:text-xl font-black text-indigo-400 leading-none">{25 - myBoughtPlayers.length}</p>
              </div>
              <div className="bg-slate-800/40 p-2 xl:p-3 rounded-2xl border border-slate-700/50 shadow-inner">
                <p className="text-[9px] xl:text-[10px] text-slate-500 uppercase font-black mb-1">Overseas</p>
                <p className="text-lg xl:text-xl font-black text-amber-400 leading-none">{10 - myOverseasCount}</p>
              </div>
            </div>

            <div className="max-h-32 xl:max-h-40 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 min-h-[60px]">
              {myBoughtPlayers.length === 0 ? (
                <div className="h-full flex items-center justify-center opacity-40">
                  <p className="text-slate-500 text-[10px] xl:text-[11px] italic font-medium">No players bought yet.</p>
                </div>
              ) : (
                myBoughtPlayers.map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2 px-3 bg-slate-800/30 rounded-xl border border-slate-700/30 group hover:border-indigo-500/30 transition-all">
                    <span className="text-[11px] xl:text-xs font-bold text-slate-300 group-hover:text-white truncate pr-2">{p.name}</span>
                    <span className="text-[8px] xl:text-[9px] font-black text-indigo-500 uppercase px-1.5 py-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20 shrink-0">
                      {p.role?.split(' ')[0] || 'PLR'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* History */}
          <div className="bg-slate-900/60 backdrop-blur-xl rounded-3xl p-6 border border-slate-700/50 shadow-xl flex-1 flex flex-col min-h-0">
            <h3 className="text-white font-black mb-6 uppercase tracking-widest text-sm flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" /> Live Auction Feed
            </h3>
            <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {soldEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-50">
                   <p className="text-slate-500 text-sm font-medium">No players sold yet.</p>
                </div>
              ) : (
                <>
                  {[...soldEvents].reverse().slice(0, 5).map((ev, i) => {
                    const p = players.find(x => x.id === ev.playerId);
                    return (
                      <div key={i} className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center group hover:bg-slate-800/80 transition-colors shadow-sm">
                        <div>
                          <p className="text-sm font-black text-slate-200">{p?.name || 'Player'}</p>
                          {!ev.isUnsold && (
                             <p className="text-xs text-slate-400 mt-1 font-medium">To: {roomDetails.roomUsers.find((r:any)=>r.user.id === ev.userId)?.user.name}</p>
                          )}
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-widest ${ev.isUnsold ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          {ev.isUnsold ? 'UNSOLD' : formatPrice(ev.amount)}
                        </span>
                      </div>
                    )
                  })}
                  
                  {soldEvents.length > 5 && (
                    <details className="group mt-2">
                       <summary className="cursor-pointer text-xs uppercase tracking-widest text-center text-slate-500 font-bold hover:text-white py-3 border border-slate-700/50 rounded-xl bg-slate-800/20 hover:bg-slate-800/60 transition-all select-none list-none marker:hidden">
                         View {soldEvents.length - 5} More
                       </summary>
                       <div className="mt-3 space-y-3">
                         {[...soldEvents].reverse().slice(5).map((ev, i) => {
                            const p = players.find(x => x.id === ev.playerId);
                            return (
                              <div key={i + 5} className="bg-slate-800/20 p-4 rounded-2xl border border-slate-700/30 flex justify-between items-center group shadow-sm opacity-80">
                                <div>
                                  <p className="text-sm font-black text-slate-400">{p?.name || 'Player'}</p>
                                  {!ev.isUnsold && (
                                     <p className="text-xs text-slate-500 mt-1 font-medium">To: {roomDetails.roomUsers.find((r:any)=>r.user.id === ev.userId)?.user.name}</p>
                                  )}
                                </div>
                                <span className={`px-3 py-1.5 rounded-xl text-xs font-black tracking-widest ${ev.isUnsold ? 'bg-slate-800/50 text-slate-600 border border-slate-700/50' : 'bg-amber-500/5 text-amber-500/50 border border-amber-500/10'}`}>
                                  {ev.isUnsold ? 'UNSOLD' : formatPrice(ev.amount)}
                                </span>
                              </div>
                            )
                         })}
                       </div>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
