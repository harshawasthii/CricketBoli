'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchWithAuth } from '@/lib/api';
import { History, Users, Wallet, Megaphone, CheckCircle2, Pause, ChevronRight, User, PlayCircle, XCircle, Zap, Shield, MessageSquare, Send } from 'lucide-react';

export default function RoomPage({ params }: { params: { code: string } }) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [roomDetails, setRoomDetails] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  
  const [auctionState, setAuctionState] = useState<any>({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
  const [soldEvents, setSoldEvents] = useState<any[]>([]);
  const [errorToast, setErrorToast] = useState('');

  const [optionRoundActive, setOptionRoundActive] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  const [bidCooldown, setBidCooldown] = useState(false);
  const [adminOnline, setAdminOnline] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const channelRef = useRef<any>(null);
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);
  const liveAuctionRef = useRef({ current_player_id: null as number | null, current_bid: 0, highest_bidder_id: null as string | null });
  const isAdminRef = useRef(false);
  const leaderboardRef = useRef<any[]>([]);
  const feedIndexRef = useRef(0); // Track insertion order for feed

  // Keep refs in sync
  useEffect(() => { liveAuctionRef.current = { current_player_id: auctionState.current_player_id, current_bid: auctionState.current_bid, highest_bidder_id: auctionState.highest_bidder_id }; }, [auctionState]);
  useEffect(() => { isAdminRef.current = String(roomDetails?.admin_id) === String(user?.id); }, [roomDetails, user]);
  useEffect(() => { leaderboardRef.current = leaderboard; }, [leaderboard]);

  // Auto-dismiss error toast
  useEffect(() => { if (!errorToast) return; const t = setTimeout(() => setErrorToast(''), 3000); return () => clearTimeout(t); }, [errorToast]);

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

  const addBidduMessage = (text: string) => { 
    setChatMessages(prev => [...prev, { id: Date.now(), type: 'system', text }]);
  };

  const initRoom = async () => {
    try {
      const details = await fetchWithAuth(`/rooms/${params.code}`);
      const lead = await fetchWithAuth(`/rooms/${params.code}/leaderboard`);
      const allPlayers = await fetchWithAuth(`/players/all`);
      setRoomDetails(details);
      setLeaderboard(lead);
      setPlayers(allPlayers || []);
      
      // Initialize auction state from persisted DB state
      if (details.current_player_id) {
        const initialState = {
          current_player_id: details.current_player_id,
          current_bid: details.current_bid || 0,
          highest_bidder_id: details.highest_bidder_id || null,
          status: 'IDLE' // Default to IDLE on rejoin/refresh
        };
        setAuctionState(initialState);
        liveAuctionRef.current = {
          current_player_id: details.current_player_id,
          current_bid: details.current_bid || 0,
          highest_bidder_id: details.highest_bidder_id || null
        };
      }

      // Merge rosters (sold) and unsold into one timeline sorted by created_at
      const allEvents: any[] = [];
      if (details.rosters) details.rosters.forEach((r: any) => {
        allEvents.push({ playerId: r.player_id, userId: r.user_id, amount: r.bought_for, isUnsold: false, timestamp: r.created_at || '' });
      });
      if (details.unsold) details.unsold.forEach((u: any) => {
        allEvents.push({ playerId: u.player_id, amount: 0, isUnsold: true, timestamp: u.created_at || '' });
      });
      // Sort chronologically, then assign feedOrder
      allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const rebuiltEvents = allEvents.map((ev, idx) => ({ ...ev, feedOrder: idx }));
      feedIndexRef.current = rebuiltEvents.length;
      setSoldEvents(rebuiltEvents);
    } catch (err: any) { setErrorToast('Re-syncing with Arena Servers...'); }
  };

  const sendRoomUpdate = (newState: any) => {
    channelRef.current?.send({ type: 'broadcast', event: 'auction_update', payload: newState });
  };

  const startAdminTimer = useCallback(() => {
    if (timerIdRef.current) clearTimeout(timerIdRef.current);
    if (!isAdminRef.current) return;
    const currentLive = liveAuctionRef.current;
    const idleState = { ...currentLive, status: 'IDLE' };
    setAuctionState(idleState);
    sendRoomUpdate(idleState);

    timerIdRef.current = setTimeout(() => {
      const live1 = liveAuctionRef.current;
      setAuctionState({ ...live1, status: 'ONCE' }); sendRoomUpdate({ ...live1, status: 'ONCE' });
      channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '🏮 Going ONCE!' });

      timerIdRef.current = setTimeout(() => {
        const live2 = liveAuctionRef.current;
        setAuctionState({ ...live2, status: 'TWICE' }); sendRoomUpdate({ ...live2, status: 'TWICE' });
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '💡 Going TWICE!' });

        timerIdRef.current = setTimeout(() => {
          const live3 = liveAuctionRef.current;
          setAuctionState({ ...live3, status: 'THRICE' }); sendRoomUpdate({ ...live3, status: 'THRICE' });
          channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: '🔨 Going THRICE!' });

          timerIdRef.current = setTimeout(() => {
            finalizePlayerFromRef(liveAuctionRef.current);
          }, 3000);
        }, 2000);
      }, 2000);
    }, 7000);
  }, []);

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
      setAuctionState(resetState); sendRoomUpdate(resetState);
      initRoom();
    } catch (e) { setErrorToast('Finalization Failed. Retrying...'); }
  };

  // ============================================================
  // Channel + Presence (admin leave = auto-pause)
  // ============================================================
  useEffect(() => {
    const userDataStr = localStorage.getItem('user');
    if (!userDataStr) { router.push('/login'); return; }
    const userData = JSON.parse(userDataStr);
    setUser(userData);
    initRoom();

    const channel = supabase.channel(`room_${params.code}`, { config: { broadcast: { self: true }, presence: { key: userData.id } } });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'auction_update' }, ({ payload }) => {
        setAuctionState((prev: any) => {
          if (payload.status !== prev.status && ['ONCE', 'TWICE', 'THRICE'].includes(payload.status)) playSfx('warning');
          return payload;
        });
      })
      .on('broadcast', { event: 'biddu_msg' }, ({ payload }) => addBidduMessage(payload))
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        setChatMessages(prev => [...prev, { ...payload, id: Date.now() }]);
      })
      .on('broadcast', { event: 'new_bid' }, ({ payload }) => {
        liveAuctionRef.current = { ...liveAuctionRef.current, current_bid: payload.amount, highest_bidder_id: payload.userId };
        setAuctionState((prev: any) => ({ ...prev, current_bid: payload.amount, highest_bidder_id: payload.userId, status: 'IDLE' }));
        const bidderName = leaderboardRef.current.find(l => String(l.user.id) === String(payload.userId))?.user.name || 'Competitor';
        addBidduMessage(`🚀 ${bidderName} bids ${formatPrice(payload.amount)}`);
        playSfx('bid');
        if (isAdminRef.current) startAdminTimer();
      })
      .on('broadcast', { event: 'player_sold' }, ({ payload }) => {
        setSoldEvents(prev => [...prev, { ...payload, isUnsold: false, feedOrder: feedIndexRef.current++ }]);
        liveAuctionRef.current = { current_player_id: null, current_bid: 0, highest_bidder_id: null };
        setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
        playSfx('sold');
        setTimeout(initRoom, 500);
      })
      .on('broadcast', { event: 'status_change' }, ({ payload }) => {
        setAuctionState((prev: any) => ({ ...prev, status: payload.status }));
        if (payload.status === 'PAUSED' && payload.reason === 'admin_left') {
          addBidduMessage('🚨 Auctioneer left! Auction auto-paused.');
        }
      })
      .on('broadcast', { event: 'player_unsold' }, ({ payload }) => {
        setSoldEvents(prev => [...prev, { playerId: payload.playerId, amount: 0, isUnsold: true, feedOrder: feedIndexRef.current++ }]);
        liveAuctionRef.current = { current_player_id: null, current_bid: 0, highest_bidder_id: null };
        setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
      })
      // Sync mechanism: when a user requests sync, admin responds with current state
      .on('broadcast', { event: 'request_sync' }, () => {
        if (isAdminRef.current && liveAuctionRef.current.current_player_id) {
          const live = liveAuctionRef.current;
          channel.send({ type: 'broadcast', event: 'sync_state', payload: { current_player_id: live.current_player_id, current_bid: live.current_bid, highest_bidder_id: live.highest_bidder_id, status: 'PAUSED' } });
        }
      })
      // Sync mechanism: when sync_state is received, update local state (only if we don't already have a player)
      .on('broadcast', { event: 'sync_state' }, ({ payload }) => {
        setAuctionState((prev: any) => {
          if (!prev.current_player_id && payload.current_player_id) {
            liveAuctionRef.current = { current_player_id: payload.current_player_id, current_bid: payload.current_bid, highest_bidder_id: payload.highest_bidder_id };
            addBidduMessage('🔄 Synced with auction — welcome back!');
            return payload;
          }
          return prev;
        });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // When someone joins and we're admin with an active auction, send them the state
        if (isAdminRef.current && liveAuctionRef.current.current_player_id) {
          setTimeout(() => {
            const live = liveAuctionRef.current;
            if (live.current_player_id) {
              channel.send({ type: 'broadcast', event: 'sync_state', payload: { current_player_id: live.current_player_id, current_bid: live.current_bid, highest_bidder_id: live.highest_bidder_id, status: 'PAUSED' } });
            }
          }, 500);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // When admin disconnects, auto-pause
        // Check if any left presence is the admin
        // We'll broadcast an admin_left event from admin's own beforeunload
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userData.id, name: userData.name, is_admin: false });
          // Request current auction state from admin (in case we're rejoining mid-auction)
          setTimeout(() => {
            channel.send({ type: 'broadcast', event: 'request_sync', payload: {} });
          }, 1000);
        }
      });

    // Admin leave detection: when this browser tab closes, if we're admin, pause the auction
    const handleBeforeUnload = () => {
      if (isAdminRef.current && liveAuctionRef.current.current_player_id) {
        channelRef.current?.send({ type: 'broadcast', event: 'status_change', payload: { status: 'PAUSED', reason: 'admin_left' } });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      channel.unsubscribe();
      if (timerIdRef.current) clearTimeout(timerIdRef.current);
    };
  }, [params.code]);

  const handleStartAuction = (playerId: number) => {
    if (!isAdminRef.current || !players) return;
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    let baseStr = String(player.base_price || '0').toLowerCase().trim();
    let num = parseFloat(baseStr.replace(/[^0-9.]/g, '')) || 0;
    let actualBase = baseStr.includes('cr') ? Math.round(num * 10000000) : (baseStr.includes('l') ? Math.round(num * 100000) : num);
    
    liveAuctionRef.current = { current_player_id: playerId, current_bid: actualBase, highest_bidder_id: null };
    const newState = { current_player_id: playerId, current_bid: actualBase, highest_bidder_id: null, status: 'IDLE' };
    
    // Persist to DB immediately
    fetchWithAuth(`/rooms/${params.code}/start`, {
      method: 'POST',
      body: JSON.stringify({ playerId, amount: actualBase })
    }).catch(err => {
      console.error('Failed to persist auction start:', err);
      setErrorToast('Database Persistence Failed! Run the SQL migration fix.');
    });

    setAuctionState(newState); sendRoomUpdate(newState);
    channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: `⚡ ${player.name} — ${player.role} — Base: ${player.base_price}` });
    startAdminTimer();
    playSfx('click');
  };

  const handlePlaceBid = async (forcedAmount?: number) => {
    if (bidCooldown || auctionState.status === 'PAUSED') return;
    if (String(auctionState.highest_bidder_id) === String(user?.id)) { setErrorToast('You are already the highest bidder!'); return; }
    
    const currentBid = liveAuctionRef.current.current_bid;
    const amt = typeof forcedAmount === 'number' ? forcedAmount : 0;
    if (amt <= currentBid && liveAuctionRef.current.highest_bidder_id) { setErrorToast('Your bid must be higher!'); return; }

    setBidCooldown(true);
    setTimeout(() => setBidCooldown(false), 2500);

    try {
      await fetchWithAuth(`/rooms/${params.code}/bid`, { method: 'POST', body: JSON.stringify({ amount: amt, playerId: auctionState.current_player_id }) });
      liveAuctionRef.current = { ...liveAuctionRef.current, current_bid: amt, highest_bidder_id: user.id };
      setAuctionState((prev: any) => ({ ...prev, current_bid: amt, highest_bidder_id: user.id, status: 'IDLE' }));
      channelRef.current?.send({ type: 'broadcast', event: 'new_bid', payload: { userId: user.id, amount: amt } });
    } catch (err: any) { 
      setErrorToast(err.message || 'Bid Failed');
      if (err.message?.toLowerCase().includes('database') || err.status === 500) {
        setErrorToast('Database Persistence Failed! Run the SQL migration fix.');
      }
    }
  };

  const handlePause = () => { if (!isAdminRef.current) return; channelRef.current?.send({ type: 'broadcast', event: 'status_change', payload: { status: 'PAUSED' } }); if (timerIdRef.current) clearTimeout(timerIdRef.current); addBidduMessage('⏸️ Auction Paused'); };
  const handleResume = () => { if (!isAdminRef.current) return; startAdminTimer(); addBidduMessage('▶️ Auction Resumed'); };
  const handleMarkUnsold = () => { if (!isAdminRef.current) return; liveAuctionRef.current = { ...liveAuctionRef.current, highest_bidder_id: null }; finalizePlayerFromRef({ ...liveAuctionRef.current, highest_bidder_id: null }); };
  const handleStartNextPlayer = () => { if (!isAdminRef.current || !availablePlayers) return; if (availablePlayers.length > 0) handleStartAuction(availablePlayers[0].id); else setErrorToast('No more players!'); };

  const formatPrice = (amt: number) => {
    if (amt >= 10000000) return `₹${(amt / 10000000).toFixed(2)} Cr`;
    if (amt >= 100000) return `₹${(amt / 100000).toFixed(2)} L`;
    return `₹${amt}`;
  };

  const isAdmin = String(roomDetails?.admin_id) === String(user?.id);
  const currentPlayer = players?.find(p => p.id === auctionState.current_player_id);
  const availablePlayers = players ? players.filter(p => optionRoundActive ? soldEvents.find(s => s.playerId === p.id && s.isUnsold) : !soldEvents.find(s => s.playerId === p.id)) : [];
  const myMembership = leaderboard.find((r: any) => String(r.user.id) === String(user?.id));
  const myBoughtPlayers = players ? players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(user?.id) && !s.isUnsold)) : [];
  const mainPlayersRemaining = players ? players.filter(p => !soldEvents.find(s => s.playerId === p.id)).length : 0;
  // Feed sorted by insertion order (most recent LAST in array = most recent on TOP in display)
  const handleSendMessage = () => {
    if (!msgInput.trim()) return;
    const payload = { user_id: user.id, user_name: user.name, text: msgInput, type: 'chat' };
    channelRef.current?.send({ type: 'broadcast', event: 'chat_message', payload });
    setChatMessages(prev => [...prev, { ...payload, id: Date.now() }]);
    setMsgInput('');
  };

  useEffect(() => {
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [chatMessages]);

  const sortedFeed = [...soldEvents].sort((a, b) => (b.feedOrder ?? 0) - (a.feedOrder ?? 0));


  // Auto mode
  useEffect(() => {
    let timer: any;
    if (isAdmin && isAutoMode && !auctionState.current_player_id && availablePlayers.length > 0) {
      timer = setTimeout(() => handleStartNextPlayer(), 3000);
    }
    return () => clearTimeout(timer);
  }, [isAdmin, isAutoMode, auctionState.current_player_id, availablePlayers.length]);

  if (!roomDetails || !user) return (
    <div className="h-screen bg-[#060B18] text-white flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-lg font-bold tracking-wider text-slate-400 animate-pulse">Entering Arena...</p>
    </div>
  );

  return (
    <div className="min-h-screen lg:h-screen bg-[#060B18] text-white font-sans flex flex-col overflow-y-auto lg:overflow-hidden">
      {errorToast && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-500/95 backdrop-blur-md text-white px-6 py-3 rounded-xl z-[200] font-bold text-sm shadow-2xl shadow-red-900/30 border border-red-400/40">{errorToast}</div>}

      
      {/* ── Header ── */}
      <div className="px-2 sm:px-4 py-1.5 sm:py-2 shrink-0">
        <div className="max-w-screen-2xl mx-auto bg-[#0D1424]/80 backdrop-blur-xl border border-white/[0.06] px-3 sm:px-5 h-12 sm:h-14 flex items-center justify-between rounded-xl">
          <div className="flex items-center gap-2 sm:gap-3 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-7 h-7 sm:w-9 sm:h-9 bg-slate-800 border border-white/10 rounded-lg p-0.5 overflow-hidden"><img src="/logo.png" className="w-full h-full object-cover rounded-md" /></div>
            <div><h1 className="text-base sm:text-xl font-black italic tracking-tighter leading-none">CricketBoli</h1><span className="text-[7px] sm:text-[8px] text-amber-500 font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] leading-none">{params.code}</span></div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-indigo-500/8 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-indigo-500/15">
              <Zap className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400" />
              <div className="text-right"><p className="text-[7px] sm:text-[8px] text-indigo-400/60 uppercase tracking-wider font-black leading-none">Left</p><p className="text-sm sm:text-base font-black text-indigo-300 leading-tight">{availablePlayers.length}</p></div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 bg-white/[0.03] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-white/[0.06]">
              <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <div className="text-right"><p className="text-[7px] sm:text-[8px] text-slate-500 uppercase tracking-wider font-black leading-none">Budget</p><p className="text-sm sm:text-base font-black text-white leading-tight">{formatPrice(myMembership?.budget || 0)}</p></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div className="flex-1 min-h-0 px-2 sm:px-4 pb-2 sm:pb-3 lg:overflow-hidden">
        <div className="max-w-screen-2xl mx-auto lg:h-full grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-2.5">
          
          {/* ─ Left: Competitors ─ */}
          <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 order-2 lg:order-1">
            <div className="bg-[#0D1424]/70 rounded-xl p-4 border border-white/[0.04] flex-1 flex flex-col min-h-0">
              <h3 className="text-[10px] text-slate-400 font-black mb-3 uppercase tracking-[0.15em] flex items-center gap-2"><Users className="w-4 h-4 text-blue-400" /> Competitors</h3>
              <div className="space-y-2 overflow-y-auto pr-1 custom-scrollbar flex-1">
                {leaderboard.map((member) => {
                  const memberPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(member.user.id) && !s.isUnsold));
                  return (
                    <div key={member.user.id} className={`p-3 rounded-lg border transition-all ${String(member.user.id) === String(user?.id) ? 'bg-indigo-500/8 border-indigo-500/25' : 'bg-white/[0.02] border-white/[0.04] hover:border-white/[0.08]'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs font-bold text-white truncate pr-2">{member.user.name}</p>
                        <span className="text-[10px] bg-black/40 font-mono text-slate-500 px-1.5 py-0.5 rounded shrink-0">{memberPlayers.length}/25</span>
                      </div>
                      <p className="text-[11px] text-emerald-400/80 font-bold">{formatPrice(member.budget)}</p>
                      {memberPlayers.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-2">
                          {memberPlayers.slice(0, 8).map(p => <span key={p.id} title={p.name} className="text-[9px] bg-white/[0.04] px-1 py-0.5 rounded text-slate-500 font-bold truncate max-w-[65px]">{p.name.split(' ').pop()}</span>)}
                          {memberPlayers.length > 8 && <span className="text-[9px] text-slate-600 font-bold px-1">+{memberPlayers.length - 8}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ─ Center: Arena ─ */}
          <div className="lg:col-span-6 flex flex-col gap-2 sm:gap-2.5 min-h-[70vh] lg:min-h-0 h-auto lg:h-full order-1 lg:order-2">
            
            {/* Compact Header Arena instead of full-screen Arena */}
            <div className="bg-[#0D1424]/70 rounded-xl border border-white/[0.04] overflow-hidden shrink-0">
              {currentPlayer ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-3 sm:p-4">
                  {/* Player Info (Small) */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-left">
                      <div className="flex gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 text-indigo-300 rounded text-[7px] font-black uppercase tracking-wider border border-indigo-500/30 bg-indigo-500/10 leading-none">{currentPlayer.role?.split(' ')[0]}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border leading-none ${currentPlayer.nationality_type?.toLowerCase() === 'overseas' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>{currentPlayer.nationality_type?.slice(0,3)}</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-display font-black text-white tracking-tighter uppercase leading-none">{currentPlayer.name}</h2>
                      <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest opacity-60">Base: {currentPlayer.base_price}</p>
                    </div>
                  </div>

                  {/* Bid Display (Small) */}
                  <div className="flex items-center gap-3 sm:gap-6 flex-1 justify-end">
                    <div className="text-right">
                      <div className="flex justify-end mb-1">
                        {auctionState.status === 'PAUSED' ? (
                          <span className="text-amber-400 font-bold text-[7px] tracking-widest uppercase animate-pulse">PAUSED</span>
                        ) : (
                          <span className={`font-bold text-[7px] tracking-widest uppercase ${['ONCE','TWICE','THRICE'].includes(auctionState.status) ? 'text-red-400' : 'text-emerald-400'}`}>{auctionState.status === 'IDLE' ? '● LIVE' : auctionState.status}</span>
                        )}
                      </div>
                      <p className="text-[12px] sm:text-lg lg:text-2xl font-black text-amber-400 leading-none">{formatPrice(auctionState.current_bid)}</p>
                      <p className="text-[7px] text-slate-500 uppercase font-bold tracking-tighter truncate max-w-[100px]">
                        {auctionState.highest_bidder_id ? leaderboard.find(l => String(l.user.id) === String(auctionState.highest_bidder_id))?.user.name : 'No bid'}
                      </p>
                    </div>

                    {/* Quick Bid Buttons (Even Smaller) */}
                    <div className="flex gap-1">
                      {[10, 50, 100].map((v) => (
                        <button 
                          key={v} onClick={() => handlePlaceBid(liveAuctionRef.current.current_bid + (v * 100000))} 
                          disabled={auctionState.status === 'PAUSED' || bidCooldown}
                          className="bg-white/[0.03] border border-white/[0.06] hover:border-amber-400/50 hover:bg-amber-400/5 text-white hover:text-amber-400 rounded-md px-2 py-1.5 font-bold text-[9px] transition-all active:scale-95 disabled:opacity-20"
                        >+{v}L</button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center opacity-30 flex items-center justify-center gap-3">
                  <Megaphone className="w-5 h-5" />
                  <p className="text-sm font-black tracking-widest">WAITING FOR NEXT PLAYER</p>
                </div>
              )}
            </div>

            {/* Unified ChatRoom Area */}
            <div className="flex-1 bg-[#0D1424]/40 rounded-xl border border-white/[0.02] flex flex-col min-h-0 relative overflow-hidden backdrop-blur-sm shadow-inner">
               <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
                 {chatMessages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-10">
                     <MessageSquare className="w-12 h-12 mb-2" />
                     <p className="font-bold uppercase tracking-[0.2em] text-[10px]">Auction Chat & BoliBot Updates</p>
                   </div>
                 )}
                 {chatMessages.map((msg) => (
                   <div key={msg.id} className={`flex flex-col ${msg.type === 'system' ? 'items-center' : (String(msg.user_id) === String(user?.id) ? 'items-end' : 'items-start')}`}>
                     {msg.type === 'system' ? (
                       <div className="bg-white/5 border border-white/5 rounded-full px-4 py-1.5 shadow-sm">
                         <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 italic leading-none">{msg.text}</p>
                       </div>
                     ) : (
                       <div className="max-w-[85%] group">
                         <p className={`text-[9px] font-bold mb-1 uppercase tracking-wider opacity-40 px-1 ${String(msg.user_id) === String(user?.id) ? 'text-right' : 'text-left'}`}>{msg.user_name}</p>
                         <div className={`px-4 py-2.5 rounded-2xl text-[13px] sm:text-sm shadow-sm transition-all border ${String(msg.user_id) === String(user?.id) ? 'bg-indigo-600 border-indigo-500/50 text-white rounded-tr-none' : 'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'}`}>
                           <p className="font-bold leading-snug">{msg.text}</p>
                         </div>
                       </div>
                     )}
                   </div>
                 ))}
                 <div ref={chatEndRef} />
               </div>

               {/* Chat Input */}
               <div className="px-3 sm:px-4 py-3 bg-[#0D1424]/60 border-t border-white/[0.04] backdrop-blur-md">
                 <div className="flex gap-2">
                   <input 
                    type="text" value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 bg-black/40 border border-white/[0.05] rounded-xl px-4 py-2 sm:py-2.5 text-sm sm:text-base font-bold focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-700"
                   />
                   <button 
                    onClick={handleSendMessage}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 sm:px-5 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center"
                   >
                     <Send className="w-4 h-4" />
                   </button>
                 </div>
               </div>
            </div>

          </div>

          {/* ─ Right: Controls & Feed ─ */}
          <div className="lg:col-span-3 flex flex-col gap-2 sm:gap-2.5 lg:h-full min-h-0 order-3">

            {/* Mobile-only: Compact Competitors Bar */}
            <div className="lg:hidden bg-[#0D1424]/70 rounded-xl p-3 border border-white/[0.04]">
              <h3 className="text-[10px] text-slate-400 font-black mb-2 uppercase tracking-[0.15em] flex items-center gap-2"><Users className="w-3.5 h-3.5 text-blue-400" /> Competitors</h3>
              <div className="flex flex-wrap gap-1.5">
                {leaderboard.map((member) => {
                  const memberPlayerCount = players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(member.user.id) && !s.isUnsold)).length;
                  return (
                    <div key={member.user.id} className={`px-2 py-1 rounded-md border text-[10px] font-bold ${String(member.user.id) === String(user?.id) ? 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300' : 'bg-white/[0.02] border-white/[0.04] text-slate-400'}`}>
                      {member.user.name.split(' ')[0]} <span className="text-emerald-400/70 ml-1">{formatPrice(member.budget)}</span> <span className="text-slate-600 ml-0.5">{memberPlayerCount}/25</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Admin Panel */}
            {isAdmin && (
              <div className="bg-[#0D1424]/70 rounded-xl p-3 sm:p-4 border border-emerald-500/15 shrink-0">
                <div className="flex justify-between items-center mb-2 sm:mb-3">
                  <h3 className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.15em]">Admin 🕹️</h3>
                  {isAutoMode && <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded text-[8px] font-bold animate-pulse border border-blue-500/20 uppercase">Auto</span>}
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex gap-1.5">
                    <button onClick={handleStartNextPlayer} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 sm:py-3 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5">NEXT <ChevronRight className="w-4 h-4" /></button>
                    <button onClick={() => setIsAutoMode(!isAutoMode)} className={`px-2.5 sm:px-3 rounded-lg font-bold text-xs sm:text-sm border transition-all ${isAutoMode ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/[0.03] border-white/[0.06] text-slate-500 hover:text-white'}`}>AUTO</button>
                  </div>
                  {currentPlayer && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {auctionState.status !== 'PAUSED' ? (
                        <button onClick={handlePause} className="bg-amber-500/8 text-amber-500 border border-amber-500/15 py-2 rounded-lg font-bold text-[9px] tracking-wider flex items-center justify-center gap-1"><Pause className="w-3 h-3" /> PAUSE</button>
                      ) : <button onClick={handleResume} className="bg-indigo-500/8 text-indigo-400 border border-indigo-500/15 py-2 rounded-lg font-bold text-[9px] tracking-wider flex items-center justify-center gap-1"><PlayCircle className="w-3 h-3" /> RESUME</button>}
                      <button onClick={handleMarkUnsold} className="bg-rose-500/8 text-rose-400 border border-rose-500/15 py-2 rounded-lg font-bold text-[9px] tracking-wider flex items-center justify-center gap-1"><XCircle className="w-3 h-3" /> UNSOLD</button>
                    </div>
                  )}
                  {mainPlayersRemaining === 0 && !optionRoundActive && (
                    <button onClick={() => setOptionRoundActive(true)} className="w-full bg-amber-500 hover:bg-amber-400 text-black py-2.5 rounded-lg font-bold text-xs uppercase animate-pulse">Option Round</button>
                  )}
                </div>
              </div>
            )}

            {/* My Roster */}
            <div className="bg-[#0D1424]/70 rounded-xl p-4 border border-indigo-500/10 shrink-0">
              <h3 className="text-[10px] text-indigo-400 font-black mb-2 uppercase tracking-[0.15em] flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> My Roster</h3>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <div className="bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.04] text-center"><p className="text-[7px] text-slate-600 font-bold uppercase leading-none mb-0.5">Total</p><p className="text-lg font-black leading-none">{myBoughtPlayers.length}</p></div>
                <div className="bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.04] text-center"><p className="text-[7px] text-slate-600 font-bold uppercase leading-none mb-0.5">Left</p><p className="text-lg font-black leading-none">{25 - myBoughtPlayers.length}</p></div>
                <div className="bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.04] text-center"><p className="text-[7px] text-slate-600 font-bold uppercase leading-none mb-0.5">OS</p><p className="text-lg font-black leading-none">{Math.max(0, 10 - (myBoughtPlayers.filter(p => p.nationality_type?.toLowerCase() === 'overseas').length))}</p></div>
              </div>
              <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                {myBoughtPlayers.length > 0 ? myBoughtPlayers.map(p => (
                  <div key={p.id} className="flex justify-between items-center py-1.5 px-2 bg-white/[0.02] rounded-md border border-white/[0.04] hover:border-indigo-500/20">
                    <span className="text-[10px] font-semibold text-slate-300 truncate pr-2">{p.name}</span>
                    <span className="text-[7px] font-bold text-indigo-400/70 uppercase px-1 py-0.5 bg-indigo-500/8 rounded">{p.role?.split(' ')[0] || 'PLR'}</span>
                  </div>
                )) : <p className="text-[9px] text-slate-700 italic py-2 text-center">Empty squad...</p>}
              </div>
            </div>

            {/* Auction Feed — sorted by feedOrder (most recent on top) */}
            <div className="bg-[#0D1424]/70 rounded-xl p-4 border border-white/[0.04] flex-1 flex flex-col min-h-0">
              <h3 className="text-[10px] text-slate-400 font-black mb-2 uppercase tracking-[0.15em] flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-slate-500" /> Feed</h3>
              <div className="space-y-1 overflow-y-auto pr-1 custom-scrollbar flex-1">
                {sortedFeed.length > 0 ? sortedFeed.slice(0, 15).map((ev, i) => {
                  const p = players.find(x => x.id === ev.playerId);
                  return (
                    <div key={`feed-${ev.feedOrder}-${i}`} className="bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04] flex justify-between items-center hover:border-white/[0.08] transition-colors">
                      <div className="truncate pr-2">
                        <p className="text-[10px] font-bold text-slate-300 truncate">{p?.name || 'Player'}</p>
                        <p className="text-[8px] text-slate-600 truncate uppercase">{ev.isUnsold ? 'Unsold' : (leaderboard.find(l => String(l.user.id) === String(ev.userId))?.user.name || 'Buyer')}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${ev.amount > 0 ? 'text-amber-400 border-amber-400/15 bg-amber-400/5' : 'text-slate-600 border-white/[0.04]'}`}>{ev.amount > 0 ? formatPrice(ev.amount) : 'UNSOLD'}</span>
                    </div>
                  );
                }) : <div className="h-full flex items-center justify-center opacity-20 italic text-[10px]">Waiting for sales...</div>}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
