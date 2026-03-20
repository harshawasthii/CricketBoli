'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchWithAuth } from '@/lib/api';
import { Trophy, History, Users, Wallet, AlertCircle, Megaphone, CheckCircle2, Play, Pause, ChevronRight, Calculator, User, PlayCircle, XCircle } from 'lucide-react';

export default function RoomPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [roomDetails, setRoomDetails] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  
  const [auctionState, setAuctionState] = useState<any>({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
  const [soldEvents, setSoldEvents] = useState<any[]>([]);
  const [bidduMessages, setBidduMessages] = useState<{id: number, text: string}[]>([]);
  const [errorToast, setErrorToast] = useState('');
  const [optionRoundActive, setOptionRoundActive] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [bidCooldown, setBidCooldown] = useState(false);

  const channelRef = useRef<any>(null);
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================================
  // FIX #1 & #2: useRef for LIVE auction state
  // React state is async. Timer closures capture stale values.
  // This ref is ALWAYS up-to-date, so the timer reads fresh data.
  // ============================================================
  const liveAuctionRef = useRef({ current_player_id: null as number | null, current_bid: 0, highest_bidder_id: null as string | null });
  const isAdminRef = useRef(false);
  const leaderboardRef = useRef<any[]>([]);

  // Keep refs in sync with state
  useEffect(() => { liveAuctionRef.current = { current_player_id: auctionState.current_player_id, current_bid: auctionState.current_bid, highest_bidder_id: auctionState.highest_bidder_id }; }, [auctionState]);
  useEffect(() => { isAdminRef.current = String(roomDetails?.admin_id) === String(user?.id); }, [roomDetails, user]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);

  // ============================================================
  // FIX #4: Auto-dismiss error toast after 3 seconds
  // ============================================================
  useEffect(() => {
    if (!errorToast) return;
    const t = setTimeout(() => setErrorToast(''), 3000);
    return () => clearTimeout(t);
  }, [errorToast]);

  // Sound Effects
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = () => { if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)(); return audioCtxRef.current; };
  const playSfx = (type: 'bid' | 'sold' | 'click' | 'warning') => {
    try {
      const ctx = getAudioCtx(); if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination);
      if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); osc.start(); osc.stop(ctx.currentTime + 0.06); }
      if (type === 'bid') { osc.type = 'triangle'; osc.frequency.setValueAtTime(600, ctx.currentTime); gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); osc.start(); osc.stop(ctx.currentTime + 0.11); }
      if (type === 'sold') { osc.type = 'sine'; osc.frequency.setValueAtTime(1047, ctx.currentTime); gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.51); }
      if (type === 'warning') { osc.type = 'sine'; osc.frequency.setValueAtTime(520, ctx.currentTime); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); osc.start(); osc.stop(ctx.currentTime + 0.21); }
    } catch (e) {}
  };

  const addBidduMessage = (text: string) => { setBidduMessages(prev => [...prev.slice(-10), { id: Date.now(), text }]); };

  const initRoom = async () => {
    try {
      const details = await fetchWithAuth(`/rooms/${params.code}`);
      const lead = await fetchWithAuth(`/rooms/${params.code}/leaderboard`);
      const allPlayers = await fetchWithAuth(`/players/all`);
      setRoomDetails(details);
      setLeaderboard(lead);
      setPlayers(allPlayers || []);
      const rebuiltEvents: any[] = [];
      if (details.rosters) details.rosters.forEach((r: any) => rebuiltEvents.push({ playerId: r.player_id, userId: r.user_id, amount: r.bought_for, isUnsold: false }));
      if (details.unsold) details.unsold.forEach((u: any) => rebuiltEvents.push({ playerId: u.player_id, amount: 0, isUnsold: true }));
      setSoldEvents(rebuiltEvents);
    } catch (err: any) { setErrorToast('Re-syncing with Arena Servers...'); }
  };

  const sendRoomUpdate = (newState: any) => {
    channelRef.current?.send({ type: 'broadcast', event: 'auction_update', payload: newState });
  };

  // ============================================================
  // FIX #1: Timer reads from liveAuctionRef (always fresh)
  // When it fires finalizePlayer, it reads the LATEST bid info.
  // ============================================================
  const startAdminTimer = useCallback(() => {
    if (timerIdRef.current) clearTimeout(timerIdRef.current);
    if (!isAdminRef.current) return;

    // Broadcast current state as IDLE (timer reset)
    const currentLive = liveAuctionRef.current;
    const idleState = { ...currentLive, status: 'IDLE' };
    setAuctionState(idleState);
    sendRoomUpdate(idleState);

    // 7s -> ONCE
    timerIdRef.current = setTimeout(() => {
      const live1 = liveAuctionRef.current;
      const onceState = { ...live1, status: 'ONCE' };
      setAuctionState(onceState);
      sendRoomUpdate(onceState);
      channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '🏮 Going ONCE!' });

      // 2s -> TWICE
      timerIdRef.current = setTimeout(() => {
        const live2 = liveAuctionRef.current;
        const twiceState = { ...live2, status: 'TWICE' };
        setAuctionState(twiceState);
        sendRoomUpdate(twiceState);
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '💡 Going TWICE!' });

        // 2s -> THRICE
        timerIdRef.current = setTimeout(() => {
          const live3 = liveAuctionRef.current;
          const thriceState = { ...live3, status: 'THRICE' };
          setAuctionState(thriceState);
          sendRoomUpdate(thriceState);
          channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '🔨 Last call! Going THRICE!' });

          // 3s -> FINALIZE (reads LATEST ref)
          timerIdRef.current = setTimeout(() => {
            const finalLive = liveAuctionRef.current;
            finalizePlayerFromRef(finalLive);
          }, 3000);
        }, 2000);
      }, 2000);
    }, 7000);
  }, []);

  // Finalize using ref data (always fresh)
  const finalizePlayerFromRef = async (live: { current_player_id: number | null, current_bid: number, highest_bidder_id: string | null }) => {
    if (!isAdminRef.current || !live.current_player_id) return;
    try {
      if (live.highest_bidder_id) {
        await fetchWithAuth(`/rooms/${params.code}/sold`, { method: 'POST', body: JSON.stringify({ playerId: live.current_player_id, buyerId: live.highest_bidder_id, amount: live.current_bid }) });
        const bidderName = leaderboardRef.current.find(l => String(l.user.id) === String(live.highest_bidder_id))?.user.name || 'Competitor';
        channelRef.current?.send({ type: 'broadcast', event: 'player_sold', payload: { playerId: live.current_player_id, userId: live.highest_bidder_id, amount: live.current_bid } });
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: `🎉 SOLD to ${bidderName} for ${formatPrice(live.current_bid)}!` });
      } else {
        await fetchWithAuth(`/rooms/${params.code}/unsold`, { method: 'POST', body: JSON.stringify({ playerId: live.current_player_id }) });
        channelRef.current?.send({ type: 'broadcast', event: 'player_unsold', payload: { playerId: live.current_player_id } });
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '❌ Player UNSOLD!' });
      }
      const resetState = { current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' };
      liveAuctionRef.current = { current_player_id: null, current_bid: 0, highest_bidder_id: null };
      setAuctionState(resetState);
      sendRoomUpdate(resetState);
      initRoom();
    } catch (e) { setErrorToast('Finalization Failed. Retrying...'); }
  };

  // ============================================================
  // Channel setup — FIX: admin restarts timer on ANY new_bid
  // ============================================================
  useEffect(() => {
    const userDataStr = localStorage.getItem('user');
    if (!userDataStr) { router.push('/login'); return; }
    const userData = JSON.parse(userDataStr);
    setUser(userData);
    initRoom();

    const channel = supabase.channel(`room_${params.code}`, { config: { broadcast: { self: true } } });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'auction_update' }, ({ payload }) => {
        setAuctionState((prev: any) => {
          if (payload.status !== prev.status && ['ONCE', 'TWICE', 'THRICE'].includes(payload.status)) playSfx('warning');
          return payload;
        });
      })
      .on('broadcast', { event: 'biddu_msg' }, ({ payload }) => addBidduMessage(payload))
      .on('broadcast', { event: 'new_bid' }, ({ payload }) => {
        // Update BOTH React state AND the live ref
        liveAuctionRef.current = { ...liveAuctionRef.current, current_bid: payload.amount, highest_bidder_id: payload.userId };
        setAuctionState((prev: any) => ({ ...prev, current_bid: payload.amount, highest_bidder_id: payload.userId, status: 'IDLE' }));
        
        const bidderName = leaderboardRef.current.find(l => String(l.user.id) === String(payload.userId))?.user.name || 'Competitor';
        addBidduMessage(`🚀 ${bidderName} bids ${formatPrice(payload.amount)}`);
        playSfx('bid');

        // *** THE KEY FIX: Admin restarts timer when ANYONE bids ***
        if (isAdminRef.current) {
          startAdminTimer();
        }
      })
      .on('broadcast', { event: 'player_sold' }, ({ payload }) => {
        setSoldEvents(prev => [...prev, payload]);
        liveAuctionRef.current = { current_player_id: null, current_bid: 0, highest_bidder_id: null };
        setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
        playSfx('sold');
        setTimeout(initRoom, 500);
      })
      .on('broadcast', { event: 'status_change' }, ({ payload }) => {
        setAuctionState((prev: any) => ({ ...prev, status: payload.status }));
      })
      .on('broadcast', { event: 'player_unsold' }, ({ payload }) => {
        setSoldEvents(prev => [...prev, { playerId: payload.playerId, amount: 0, isUnsold: true }]);
        liveAuctionRef.current = { current_player_id: null, current_bid: 0, highest_bidder_id: null };
        setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
      })
      .subscribe();

    return () => { channel.unsubscribe(); if (timerIdRef.current) clearTimeout(timerIdRef.current); };
  }, [params.code]);

  const handleStartAuction = (playerId: number) => {
    if (!isAdminRef.current || !players) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    let baseStr = String(player.base_price || '0').toLowerCase().trim();
    let num = parseFloat(baseStr.replace(/[^0-9.]/g, '')) || 0;
    let actualBase = baseStr.includes('cr') ? Math.round(num * 10000000) : (baseStr.includes('l') ? Math.round(num * 100000) : num);
    
    // Set ref FIRST, then state
    liveAuctionRef.current = { current_player_id: playerId, current_bid: actualBase, highest_bidder_id: null };
    const newState = { current_player_id: playerId, current_bid: actualBase, highest_bidder_id: null, status: 'IDLE' };
    setAuctionState(newState);
    sendRoomUpdate(newState);
    channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: `⚡ UP NEXT: ${player.name} (${player.base_price})` });
    startAdminTimer();
    playSfx('click');
  };

  // ============================================================
  // FIX #3: 2.5s cooldown + no consecutive self-bids
  // ============================================================
  const handlePlaceBid = async (forcedAmount?: number) => {
    if (bidCooldown || auctionState.status === 'PAUSED') return;

    // Block self-consecutive bids
    if (String(auctionState.highest_bidder_id) === String(user?.id)) {
      setErrorToast('You are already the highest bidder! Wait for someone else.');
      return;
    }
    
    const currentBid = liveAuctionRef.current.current_bid; // Read from ref for accuracy
    const amt = typeof forcedAmount === 'number' ? forcedAmount : 0;
    
    if (amt <= currentBid && liveAuctionRef.current.highest_bidder_id) {
      setErrorToast('Your bid must be higher!');
      return;
    }

    // Start 2.5s cooldown
    setBidCooldown(true);
    setTimeout(() => setBidCooldown(false), 2500);

    try {
      await fetchWithAuth(`/rooms/${params.code}/bid`, { method: 'POST', body: JSON.stringify({ amount: amt, playerId: auctionState.current_player_id }) });
      
      // Update ref FIRST
      liveAuctionRef.current = { ...liveAuctionRef.current, current_bid: amt, highest_bidder_id: user.id };
      setAuctionState((prev: any) => ({ ...prev, current_bid: amt, highest_bidder_id: user.id, status: 'IDLE' }));
      
      // Broadcast — admin's handler will restart the timer
      channelRef.current?.send({ type: 'broadcast', event: 'new_bid', payload: { userId: user.id, amount: amt } });
    } catch (err: any) { setErrorToast(err.message || 'Bid Failed'); }
  };

  const handlePause = () => { if (!isAdminRef.current) return; channelRef.current?.send({ type: 'broadcast', event: 'status_change', payload: { status: 'PAUSED' } }); if (timerIdRef.current) clearTimeout(timerIdRef.current); addBidduMessage('⏸️ Auction Paused'); };
  const handleResume = () => { if (!isAdminRef.current) return; startAdminTimer(); addBidduMessage('▶️ Auction Resumed'); };
  const handleMarkUnsold = () => { if (!isAdminRef.current) return; liveAuctionRef.current = { ...liveAuctionRef.current, highest_bidder_id: null }; finalizePlayerFromRef({ ...liveAuctionRef.current, highest_bidder_id: null }); };
  
  const handleStartNextPlayer = () => {
    if (!isAdminRef.current || !availablePlayers) return;
    if (availablePlayers.length > 0) handleStartAuction(availablePlayers[0].id);
    else setErrorToast('No more players available in this round!');
  };

  const formatPrice = (amt: number) => {
    if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(2)} Cr`;
    if (amt >= 100000) return `₹${(amt / 100000).toFixed(2)} L`;
    return `₹${amt}`;
  };

  // Derived values
  const isAdmin = String(roomDetails?.admin_id) === String(user?.id);
  const currentPlayer = players?.find(p => p.id === auctionState.current_player_id);
  const availablePlayers = players ? players.filter(p => optionRoundActive ? soldEvents.find(s => s.playerId === p.id && s.isUnsold) : !soldEvents.find(s => s.playerId === p.id)) : [];
  const myMembership = leaderboard.find((r: any) => String(r.user.id) === String(user?.id));
  const myBoughtPlayers = players ? players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(user?.id) && !s.isUnsold)) : [];
  const mainPlayersRemaining = players ? players.filter(p => !soldEvents.find(s => s.playerId === p.id)).length : 0;

  // Auto mode
  useEffect(() => {
    let timer: any;
    if (isAdmin && isAutoMode && !auctionState.current_player_id && availablePlayers.length > 0) {
      timer = setTimeout(() => handleStartNextPlayer(), 3000);
    }
    return () => clearTimeout(timer);
  }, [isAdmin, isAutoMode, auctionState.current_player_id, availablePlayers.length]);

  if (!roomDetails || !user) return <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center font-bold text-2xl gap-8 animate-pulse italic">Entering CricketBoli Arena...</div>;

  return (
    <div className="h-screen bg-[#0B1120] text-white font-sans p-3 md:p-4 lg:p-5 flex flex-col items-center overflow-hidden">
      {errorToast && <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-8 py-4 rounded-full z-[200] flex items-center gap-3 border border-red-400 font-bold shadow-2xl animate-in zoom-in-95 duration-300">{errorToast}</div>}
      
      {/* Header */}
      <div className="w-full max-w-screen-2xl bg-slate-900/40 backdrop-blur-xl border border-white/5 px-6 h-16 flex items-center justify-between shrink-0 rounded-2xl mb-3 shadow-2xl">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-10 h-10 bg-slate-800 border border-white/10 rounded-xl p-0.5 shadow-2xl overflow-hidden"><img src="/logo.png" className="w-full h-full object-cover rounded-lg" /></div>
            <div className="flex flex-col"><h1 className="text-2xl font-black italic tracking-tighter leading-none">CricketBoli</h1><span className="text-[9px] text-amber-500 font-bold uppercase tracking-[0.2em] mt-0.5 ml-1 leading-none">{params.code}</span></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20">
              <Megaphone className="w-4 h-4 text-indigo-400" /><div className="text-right"><p className="text-[9px] text-indigo-400/70 uppercase tracking-[0.15em] font-black">Players Left</p><p className="text-lg font-black text-indigo-300">{availablePlayers.length}</p></div>
            </div>
            <div className="flex items-center gap-3 bg-slate-800/80 px-4 py-2 rounded-xl border border-white/5 shadow-2xl">
              <Wallet className="w-4 h-4 text-emerald-400" /><div className="text-right"><p className="text-[9px] text-slate-500 uppercase tracking-[0.15em] font-black">My Budget</p><p className="text-lg font-black text-white">{formatPrice(myMembership?.budget || 0)}</p></div>
            </div>
          </div>
      </div>

      <div className="w-full max-w-screen-2xl flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 relative z-10 min-h-0 overflow-hidden">
        
        {/* Left: Competitors */}
        <div className="lg:col-span-3 flex flex-col gap-3 h-full min-h-0 order-2 lg:order-1">
          <div className="bg-slate-900/60 rounded-[32px] p-6 border border-slate-700/50 shadow-2xl flex-1 flex flex-col min-h-0">
             <h3 className="text-white font-black mb-6 uppercase tracking-widest text-[11px] flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" /> Competitors</h3>
             <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
               {leaderboard.map((member) => {
                 const memberPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(member.user.id) && !s.isUnsold));
                 return (
                  <div key={member.user.id} className={`p-4 rounded-2xl border transition-all ${String(member.user.id) === String(user?.id) ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-800/40 border-slate-700/50'}`}>
                    <div className="flex justify-between items-start mb-2">
                       <p className="text-sm font-black text-white truncate pr-4">{member.user.name}</p>
                       <span className="text-[10px] bg-slate-950 font-bold text-slate-500 px-2 py-0.5 rounded border border-slate-800 shrink-0">{memberPlayers.length}/25</span>
                    </div>
                    <p className="text-[11px] text-emerald-400 font-bold">{formatPrice(member.budget)}</p>
                    <div className="flex flex-wrap gap-1 mt-3">
                      {memberPlayers.map(p => <span key={p.id} title={p.name} className="text-[8px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700/50 text-slate-400 font-bold uppercase truncate max-w-[60px]">{p.name.split(' ').pop()}</span>)}
                    </div>
                  </div>
                 )
               })}
             </div>
          </div>
        </div>

        {/* Center: Arena */}
        <div className="lg:col-span-6 flex flex-col gap-3 h-full min-h-0 order-1 lg:order-2">
           {/* Bolibot Messages */}
           <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 p-6 rounded-[32px] border border-blue-500/30 flex items-start gap-5 shadow-xl shrink-0">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl border-2 border-blue-400 p-1 flex-shrink-0 animate-pulse overflow-hidden"><img src="/logo.png" className="w-full h-full object-cover" /></div>
              <div className="flex-1 min-w-0 h-[70px] overflow-y-auto custom-scrollbar flex flex-col justify-end">
                {bidduMessages.map((msg) => (
                  <div key={msg.id} className="text-xl font-black text-white animate-in slide-in-from-left-4 duration-300 mb-1">{msg.text}</div>
                ))}
              </div>
           </div>

           {/* Main Display */}
           <div className="bg-slate-900/60 rounded-[32px] p-6 flex-1 w-full flex flex-col items-center justify-center shadow-2xl relative overflow-hidden border border-slate-700/50">
            {currentPlayer ? (
              <div className="text-center w-full max-w-3xl flex flex-col items-center justify-between h-full py-4 animate-in zoom-in-95 duration-500">
                <div>
                  <div className="flex justify-center gap-3 mb-4">
                    <span className="px-5 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-black uppercase tracking-widest border border-indigo-500/30">{currentPlayer.role}</span>
                    <span className={`px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${currentPlayer.nationality_type?.toLowerCase() === 'overseas' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>{currentPlayer.nationality_type}</span>
                  </div>
                  <h2 className="text-5xl lg:text-7xl font-black text-white italic tracking-tighter drop-shadow-2xl">{currentPlayer.name}</h2>
                  <div className="mt-4 px-6 py-2 bg-slate-800/80 rounded-full border border-slate-700 text-slate-400 font-bold text-sm">Base Price: {currentPlayer.base_price}</div>
                </div>

                <div className={`w-full max-w-xl bg-slate-950/90 rounded-[32px] p-8 border ${String(auctionState.highest_bidder_id) === String(user?.id) ? 'border-amber-500/60 shadow-[0_0_50px_rgba(245,158,11,0.2)]' : 'border-slate-800'}`}>
                   {auctionState.status === 'PAUSED' ? (
                     <div className="flex justify-center mb-4"><span className="bg-amber-500/20 text-amber-500 px-6 py-1.5 rounded-full font-black text-[10px] tracking-widest border border-amber-500/40 animate-pulse uppercase">AUCTION PAUSED</span></div>
                   ) : (
                    <div className="flex justify-center mb-4"><span className={`px-6 py-1.5 rounded-full font-black text-[10px] tracking-widest border uppercase ${['ONCE','TWICE','THRICE'].includes(auctionState.status) ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-bounce' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>{auctionState.status === 'IDLE' ? 'LIVE NOW' : `GOING ${auctionState.status}`}</span></div>
                   )}
                   <p className="text-[11px] text-amber-500/80 mb-2 uppercase tracking-[0.3em] font-black">Current Price</p>
                   <p className="text-6xl lg:text-8xl font-black text-amber-400 mb-6 drop-shadow-[0_0_20px_rgba(251,191,36,0.2)]">{formatPrice(auctionState.current_bid)}</p>
                   
                   <div className="mb-8 min-h-[30px] flex justify-center">
                    {auctionState.highest_bidder_id ? (
                       <div className="flex items-center gap-3 px-5 py-2 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                          <CheckCircle2 className="w-5 h-5 text-amber-400" />
                          <span className="text-amber-300 font-bold text-sm">Bid by {leaderboard.find(l => String(l.user.id) === String(auctionState.highest_bidder_id))?.user.name || 'Competitor'}</span>
                       </div>
                    ) : <span className="text-slate-600 font-black uppercase text-[10px] tracking-widest italic">Awaiting open bid...</span>}
                   </div>
                   
                   <div className="grid grid-cols-5 gap-3">
                      {[10, 30, 50, 75, 100].map((v) => (
                        <button 
                          key={v} 
                          onClick={() => handlePlaceBid(liveAuctionRef.current.current_bid + (v * 100000))} 
                          disabled={auctionState.status === 'PAUSED' || bidCooldown}
                          className={`group bg-slate-900 border-2 border-slate-800 hover:border-amber-400 text-white hover:text-amber-400 rounded-2xl py-5 font-black text-[10px] transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-30 shadow-inner ${bidCooldown ? 'cursor-not-allowed' : ''}`}
                        >
                          <span className="text-[8px] text-slate-500 group-hover:text-amber-500/60 block leading-none mb-1">+</span>{v}L
                        </button>
                      ))}
                   </div>
                   
                   {/* Open bid button — only if no one has bid yet */}
                   {!auctionState.highest_bidder_id && !bidCooldown && auctionState.status !== 'PAUSED' && (
                     <button onClick={() => handlePlaceBid(liveAuctionRef.current.current_bid)} className="w-full mt-4 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all shadow-lg shadow-emerald-900/20">OPEN BID AT BASE</button>
                   )}
                   
                   {/* Cooldown indicator */}
                   {bidCooldown && (
                     <div className="mt-4 text-center text-amber-500/60 text-[10px] font-black uppercase tracking-widest animate-pulse">⏳ Bid cooldown (2.5s)...</div>
                   )}
                </div>
              </div>
            ) : (
                <div className="text-center opacity-40 animate-pulse flex flex-col items-center gap-6"><Megaphone className="w-20 h-20 text-slate-600" /><p className="text-4xl font-black tracking-tighter">WAITING FOR NEXT PLAYER</p></div>
            )}
           </div>
        </div>

        {/* Right: Controls & Feed */}
        <div className="lg:col-span-3 flex flex-col gap-3 h-full min-h-0 order-3">
          
          {/* Admin Panel */}
          {isAdmin && (
            <div className="bg-slate-900/60 rounded-[32px] p-6 border border-emerald-500/20 shadow-2xl shrink-0">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-emerald-400 font-black uppercase tracking-widest text-[10px] italic">Admin Panel 🕹️</h3>
                 {isAutoMode && <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-[8px] font-black animate-pulse border border-blue-500/30 uppercase tracking-tighter shadow-lg shadow-blue-500/10 shrink-0">Bot Playing...</span>}
               </div>
               <div className="space-y-4">
                 <div className="flex gap-2">
                    <button onClick={handleStartNextPlayer} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-2xl font-black transition-all flex items-center justify-center gap-2 group shadow-xl shadow-emerald-900/10">NEXT <ChevronRight className="w-5 h-5 group-hover:translate-x-1" /></button>
                    <button onClick={() => setIsAutoMode(!isAutoMode)} className={`px-4 rounded-2xl font-black border-2 transition-all ${isAutoMode ? 'bg-blue-600 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-white'}`}>AUTO</button>
                 </div>
                 {currentPlayer && (
                   <div className="grid grid-cols-2 gap-2">
                      {auctionState.status !== 'PAUSED' ? (
                        <button onClick={handlePause} className="bg-amber-500/10 text-amber-500 border border-amber-500/20 py-3 rounded-xl font-black text-[10px] tracking-widest flex flex-col items-center justify-center gap-1"><Pause className="w-4 h-4" /> PAUSE</button>
                      ) : <button onClick={handleResume} className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 py-3 rounded-xl font-black text-[10px] tracking-widest flex flex-col items-center justify-center gap-1"><PlayCircle className="w-4 h-4" /> RESUME</button>}
                      <button onClick={handleMarkUnsold} className="bg-rose-500/10 text-rose-500 border border-rose-500/20 py-3 rounded-xl font-black text-[10px] tracking-widest flex flex-col items-center justify-center gap-1"><XCircle className="w-4 h-4" /> UNSOLD</button>
                   </div>
                 )}
                 {mainPlayersRemaining === 0 && !optionRoundActive && (
                   <button onClick={() => setOptionRoundActive(true)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 py-4 rounded-xl font-black animate-bounce shadow-xl uppercase text-xs tracking-tighter">START OPTION ROUND</button>
                 )}
               </div>
            </div>
          )}

          {/* My Roster */}
          <div className="bg-slate-900/60 rounded-[32px] p-6 border border-indigo-500/20 shadow-xl shrink-0">
             <h3 className="text-indigo-400 font-black mb-4 uppercase tracking-widest text-[10px] flex items-center gap-2"><User className="w-4 h-4" /> My Roster</h3>
             <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50 text-center"><p className="text-[8px] text-slate-500 font-black uppercase mb-1 leading-none">Total</p><p className="text-xl font-black leading-none">{myBoughtPlayers.length}</p></div>
                <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50 text-center"><p className="text-[8px] text-slate-500 font-black uppercase mb-1 leading-none">Left</p><p className="text-xl font-black leading-none">{25 - myBoughtPlayers.length}</p></div>
                <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50 text-center"><p className="text-[8px] text-slate-500 font-black uppercase mb-1 leading-none">OS</p><p className="text-xl font-black leading-none">{Math.max(0, 10 - (myBoughtPlayers.filter(p => p.nationality_type?.toLowerCase() === 'overseas').length))}</p></div>
             </div>
             <div className="max-h-32 overflow-y-auto custom-scrollbar pr-1 space-y-1.5 min-h-[50px]">
                {myBoughtPlayers.length > 0 ? myBoughtPlayers.map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2 px-3 bg-slate-800/20 rounded-lg border border-slate-700/30 group hover:border-indigo-500/30">
                    <span className="text-[10px] font-bold text-slate-300 group-hover:text-white truncate pr-2">{p.name}</span>
                    <span className="text-[8px] font-black text-indigo-500 uppercase px-1.5 py-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20">{p.role?.split(' ')[0] || 'PLR'}</span>
                  </div>
                )) : <div className="text-[10px] text-slate-700 font-bold italic py-4 text-center">Empty squad...</div>}
             </div>
          </div>

          {/* Auction Feed — chronological, most recent first */}
          <div className="bg-slate-900/60 rounded-2xl p-4 border border-slate-700/50 shadow-xl flex-1 flex flex-col min-h-0">
             <h3 className="text-white font-black mb-3 uppercase tracking-widest text-[10px] flex items-center gap-2"><History className="w-4 h-4 text-slate-500" /> Auction Feed</h3>
             <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
               {soldEvents.length > 0 ? soldEvents.map((ev, i) => {
                 const p = players.find(x => x.id === ev.playerId);
                 return (
                   <div key={`feed-${i}`} className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 flex justify-between items-center group">
                      <div className="truncate pr-2"><p className="text-[11px] font-black text-slate-200 truncate">{p?.name || 'Player'}</p><p className="text-[9px] text-slate-600 truncate uppercase mt-0.5">{ev.userId ? (leaderboard.find(l => String(l.user.id) === String(ev.userId))?.user.name || 'Competitor') : 'Unsold'}</p></div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border shrink-0 ${ev.amount > 0 ? 'text-amber-400 border-amber-400/20 bg-amber-400/5' : 'text-slate-600 border-slate-800'}`}>{ev.amount > 0 ? formatPrice(ev.amount) : 'UNSOLD'}</span>
                   </div>
                 );
               }) : <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-xs">Waiting for sales...</div>}
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
