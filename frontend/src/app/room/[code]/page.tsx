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
  const [expandedMobileCompetitor, setExpandedMobileCompetitor] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const mobileChatEndRef = useRef<HTMLDivElement>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [systemMessages, setSystemMessages] = useState<any[]>([]);
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
    setSystemMessages(prev => [...prev, { id: Date.now(), type: 'system', text }]);
  };

  const initRoom = async () => {
    try {
      const details = await fetchWithAuth(`/rooms/${params.code}`);
      const lead = await fetchWithAuth(`/rooms/${params.code}/leaderboard`);
      const allPlayers = await fetchWithAuth(`/players/all`);
      setRoomDetails(details);
      setLeaderboard(lead);
      setPlayers(allPlayers || []);
      addBidduMessage('🏟️ Arena Connected — Bolibot is active!');
      
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
      const soldPlayerIds = new Set();
      if (details.rosters) details.rosters.forEach((r: any) => {
        allEvents.push({ playerId: r.player_id, userId: r.user_id, amount: r.bought_for, isUnsold: false, timestamp: r.created_at || '' });
        soldPlayerIds.add(r.player_id);
      });
      if (details.unsold) details.unsold.forEach((u: any) => {
        // Robustness: only add unsold record if player is not currently in rosters
        if (!soldPlayerIds.has(u.player_id)) {
          allEvents.push({ playerId: u.player_id, amount: 0, isUnsold: true, timestamp: u.created_at || '' });
        }
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
      const msgOnce = '🏮 Going ONCE!';
      channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgOnce });
      addBidduMessage(msgOnce);

      timerIdRef.current = setTimeout(() => {
        const live2 = liveAuctionRef.current;
        setAuctionState({ ...live2, status: 'TWICE' }); sendRoomUpdate({ ...live2, status: 'TWICE' });
        const msgTwice = '💡 Going TWICE!';
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgTwice });
        addBidduMessage(msgTwice);

        timerIdRef.current = setTimeout(() => {
          const live3 = liveAuctionRef.current;
          setAuctionState({ ...live3, status: 'THRICE' }); sendRoomUpdate({ ...live3, status: 'THRICE' });
          const msgThrice = '🔨 Going THRICE!';
          channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgThrice });
          addBidduMessage(msgThrice);

          timerIdRef.current = setTimeout(() => {
            finalizePlayerFromRef(liveAuctionRef.current);
          }, 3000);
        }, 2000);
      }, 2000);
    }, 5000);
  }, []);

  const finalizePlayerFromRef = async (live: { current_player_id: number | null, current_bid: number, highest_bidder_id: string | null }) => {
    if (!isAdminRef.current || !live.current_player_id) return;
    try {
      if (live.highest_bidder_id) {
        await fetchWithAuth(`/rooms/${params.code}/sold`, { method: 'POST', body: JSON.stringify({ playerId: live.current_player_id, buyerId: live.highest_bidder_id, amount: live.current_bid }) });
        const bidderName = leaderboardRef.current.find(l => String(l.user.id) === String(live.highest_bidder_id))?.user.name || 'Competitor';
        const msgSold = `🎉 SOLD to ${bidderName} for ${formatPrice(live.current_bid)}!`;
        channelRef.current?.send({ type: 'broadcast', event: 'player_sold', payload: { playerId: live.current_player_id, userId: live.highest_bidder_id, amount: live.current_bid } });
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgSold });
        addBidduMessage(msgSold);
      } else {
        await fetchWithAuth(`/rooms/${params.code}/unsold`, { method: 'POST', body: JSON.stringify({ playerId: live.current_player_id }) });
        const msgUnsold = '❌ Player UNSOLD!';
        channelRef.current?.send({ type: 'broadcast', event: 'player_unsold', payload: { playerId: live.current_player_id } });
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgUnsold });
        addBidduMessage(msgUnsold);
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

    const channel = supabase.channel(`room_${params.code}`, { config: { broadcast: { self: false }, presence: { key: userData.id } } });
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
      .on('broadcast', { event: 'toggle_option_round' }, ({ payload }) => {
        setOptionRoundActive(payload.active);
        addBidduMessage(payload.active ? '✨ Optional Round is now ACTIVE!' : '✨ Optional Round is deactivated.');
      })
      .on('broadcast', { event: 'auction_completed' }, () => {
        setRoomDetails((prev: any) => ({ ...prev, status: 'COMPLETED' }));
        addBidduMessage('🏁 THE AUCTION HAS COMPLETED!');
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
    const msgStart = `⚡ ${player.name} — ${player.role} — Base: ${player.base_price}`;
    channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: msgStart });
    addBidduMessage(msgStart);
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
      // Announce own bid via Bolibot (broadcast self:false means sender won't receive new_bid)
      addBidduMessage(`🚀 You bid ${formatPrice(amt)}`);
      playSfx('bid');
      if (isAdminRef.current) startAdminTimer();
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

  const handleToggleOptionRound = () => {
    if (!isAdminRef.current) return;
    const newState = !optionRoundActive;
    setOptionRoundActive(newState);
    channelRef.current?.send({ type: 'broadcast', event: 'toggle_option_round', payload: { active: newState } });
    addBidduMessage(newState ? '✨ Optional Round activated' : '✨ Optional Round deactivated');
  };

  const handleEndAuction = async () => {
    if (!isAdminRef.current) return;
    if (!confirm('Are you sure you want to COMPLETE the auction? This will disable all bidding.')) return;
    try {
      await fetchWithAuth(`/rooms/${params.code}/end`, { method: 'POST' });
      setRoomDetails((prev: any) => ({ ...prev, status: 'COMPLETED' }));
      channelRef.current?.send({ type: 'broadcast', event: 'auction_completed', payload: {} });
      addBidduMessage('🏁 Auction completed by Admin');
    } catch (e) { setErrorToast('Failed to complete auction'); }
  };

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
      mobileChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    <div className="min-h-screen lg:h-screen bg-[#060B18] text-white font-sans flex flex-col overflow-y-auto lg:overflow-hidden select-none [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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
          
          {/* ─ Left: Competitors & Chat ─ */}
          <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 order-2 lg:order-1 gap-2.5">
            {/* Competitors List (Expanded) */}
            <div className="bg-[#0D1424]/70 rounded-xl p-4 border border-white/[0.04] flex-[0.6] flex flex-col min-h-0">
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
                          {memberPlayers.map(p => <span key={p.id} title={p.name} className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded text-slate-400 font-bold border border-white/[0.05]">{p.name.split(' ').pop()}</span>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Unified ChatRoom (Reduced) */}
            <div className="flex-[0.4] bg-[#0D1424]/40 rounded-xl border border-white/[0.02] flex flex-col min-h-0 relative overflow-hidden backdrop-blur-sm shadow-inner group">
               <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 custom-scrollbar">
                 {chatMessages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-4">
                     <MessageSquare className="w-8 h-8 mb-2" />
                     <p className="font-bold uppercase tracking-[0.1em] text-[8px]">Arena Chat</p>
                   </div>
                 )}
                 {chatMessages.map((msg) => (
                   <div key={msg.id} className={`flex flex-col ${String(msg.user_id) === String(user?.id) ? 'items-end' : 'items-start'}`}>
                     <div className="max-w-[90%]">
                       <p className={`text-[8px] font-bold mb-0.5 uppercase tracking-wider opacity-30 px-1 ${String(msg.user_id) === String(user?.id) ? 'text-right' : 'text-left'}`}>{msg.user_name.split(' ')[0]}</p>
                       <div className={`px-3 py-1.5 rounded-xl text-[12px] shadow-sm border ${String(msg.user_id) === String(user?.id) ? 'bg-indigo-600 border-indigo-500/50 text-white rounded-tr-none' : 'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'}`}>
                         <p className="font-bold leading-tight">{msg.text}</p>
                       </div>
                     </div>
                   </div>
                 ))}
                 <div ref={chatEndRef} />
               </div>

               {/* Chat Input (Sidebar Compact) */}
               <div className="px-2 py-2 bg-[#0D1424]/60 border-t border-white/[0.04]">
                 <div className="flex gap-1.5">
                   <input 
                    type="text" value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Chat..."
                    className="flex-1 bg-black/40 border border-white/[0.05] rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-700"
                   />
                   <button 
                    onClick={handleSendMessage}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded-lg font-bold transition-all active:scale-95 flex items-center justify-center shrink-0"
                   >
                     <Send className="w-3.5 h-3.5" />
                   </button>
                 </div>
               </div>
            </div>
          </div>

          {/* ─ Center: Arena ─ */}
          <div className="lg:col-span-6 flex flex-col gap-2 sm:gap-2.5 min-h-[70vh] lg:min-h-0 h-auto lg:h-full order-1 lg:order-2">
            
            {/* Bolibot — SHARP (Expanded) */}
            <div className="bg-[#0D1424] rounded-xl border border-cyan-500/20 flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-5 shrink-0 shadow-[0_0_40px_-10px_rgba(34,211,238,0.2)]">
              <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/30 flex items-center justify-center shrink-0 relative">
                <Shield className="w-5 h-5 sm:w-7 sm:h-7 text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0 max-h-[60px] sm:max-h-[80px] overflow-y-auto custom-scrollbar flex flex-col justify-center">
                {systemMessages.length === 0 ? (
                  <div className="flex flex-col">
                    <p className="text-sm sm:text-base font-black text-cyan-400 animate-pulse uppercase tracking-widest">{auctionState.status === 'IDLE' ? 'Arena Live' : `Going ${auctionState.status}`}</p>
                    <p className="text-[10px] text-slate-500 italic font-medium">Waiting for Bolibot broadcast...</p>
                  </div>
                ) : systemMessages.slice(-3).map((msg) => (
                  <p key={msg.id} className="text-sm sm:text-base font-black text-white leading-tight animate-in slide-in-from-left-2 duration-200 tracking-tight">{msg.text}</p>
                ))}
              </div>
              <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.6)] shrink-0" />
            </div>

            {/* Main Player Display (Slightly Reduced Height) */}
            <div className="bg-[#0D1424]/70 rounded-xl flex-1 w-full flex flex-col items-center justify-center relative overflow-y-auto border border-white/[0.04]">
              {currentPlayer ? (
                <div className="text-center w-full max-w-2xl flex flex-col items-center justify-center gap-4 sm:gap-6 py-4 sm:py-6 px-3 sm:px-4 animate-in zoom-in-95 duration-400">
                  <div className="shrink-0">
                    <div className="flex justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
                      <span className="px-2.5 sm:px-3 text-indigo-300 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] border border-indigo-500/30 bg-indigo-500/20 py-1 shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)]">{currentPlayer.role}</span>
                      <span className={`px-2.5 sm:px-3 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm py-1 ${currentPlayer.nationality_type?.toLowerCase() === 'overseas' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 shadow-rose-500/10' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10'}`}>{currentPlayer.nationality_type}</span>
                    </div>
                    <h2 className="text-3xl sm:text-5xl lg:text-7xl font-display font-black text-white tracking-tighter uppercase leading-[0.85] drop-shadow-[0_0_40px_rgba(255,255,255,0.2)] mb-2 sm:mb-3">{currentPlayer.name}</h2>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 font-black tracking-[0.3em] uppercase opacity-70">Base: {currentPlayer.base_price}</p>
                  </div>

                  <div className={`w-full max-w-lg bg-black/50 rounded-xl p-3 sm:p-5 border ${String(auctionState.highest_bidder_id) === String(user?.id) ? 'border-amber-500/40 shadow-[0_0_40px_-10px_rgba(245,158,11,0.2)]' : 'border-white/[0.06]'}`}>
                    <div className="flex justify-center mb-1.5 sm:mb-2">
                      {auctionState.status === 'PAUSED' ? (
                        <span className="bg-amber-500/15 text-amber-400 px-3 sm:px-4 py-0.5 sm:py-1 rounded-md font-bold text-[8px] sm:text-[9px] tracking-widest border border-amber-500/20 animate-pulse uppercase">PAUSED</span>
                      ) : (
                        <span className={`px-3 sm:px-4 py-0.5 sm:py-1 rounded-md font-bold text-[8px] sm:text-[9px] tracking-widest border uppercase ${['ONCE','TWICE','THRICE'].includes(auctionState.status) ? 'bg-red-500/15 text-red-400 border-red-500/20 animate-bounce' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'}`}>{auctionState.status === 'IDLE' ? '● LIVE' : `GOING ${auctionState.status}`}</span>
                      )}
                    </div>
                    <p className="text-[8px] sm:text-[9px] text-amber-500/60 mb-0.5 sm:mb-1 uppercase tracking-[0.25em] font-bold">Current Price</p>
                    <p className="text-3xl sm:text-5xl lg:text-6xl font-black text-amber-400 mb-2 sm:mb-3 leading-none break-all">{formatPrice(auctionState.current_bid)}</p>
                    
                    <div className="mb-2 sm:mb-4 min-h-[20px] sm:min-h-[24px] flex justify-center">
                      {auctionState.highest_bidder_id ? (
                        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 bg-amber-500/8 rounded-lg border border-amber-500/15">
                          <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
                          <span className="text-amber-300 font-semibold text-[10px] sm:text-xs">{leaderboard.find(l => String(l.user.id) === String(auctionState.highest_bidder_id))?.user.name || 'Competitor'}</span>
                        </div>
                      ) : <span className="text-slate-600 font-bold text-[8px] sm:text-[9px] tracking-widest italic uppercase">Awaiting bid...</span>}
                    </div>
                    
                    <div className="grid grid-cols-5 gap-1.5">
                      {[10, 30, 50, 75, 100].map((v) => (
                        <button 
                          key={v} onClick={() => handlePlaceBid(liveAuctionRef.current.current_bid + (v * 100000))} 
                          disabled={auctionState.status === 'PAUSED' || bidCooldown || roomDetails.status === 'COMPLETED'}
                          className={`bg-white/[0.03] border border-white/[0.06] hover:border-amber-400/50 hover:bg-amber-400/5 text-white hover:text-amber-400 rounded-lg py-2.5 sm:py-3 font-bold text-xs sm:text-[10px] transition-all active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed`}
                        ><span className="text-[7px] text-slate-600 block leading-none mb-0.5">+</span>{v}L</button>
                      ))}
                    </div>
                    {!auctionState.highest_bidder_id && !bidCooldown && auctionState.status !== 'PAUSED' && roomDetails.status !== 'COMPLETED' && (
                      <button onClick={() => handlePlaceBid(liveAuctionRef.current.current_bid)} className="w-full mt-2 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all text-xs sm:sm">OPEN BID AT BASE</button>
                    )}
                    {bidCooldown && <p className="mt-1.5 sm:mt-2 text-center text-amber-500/40 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider animate-pulse">⏳ Cooldown 2.5s</p>}
                  </div>
                </div>
              ) : (
                <div className="text-center opacity-30 flex flex-col items-center gap-3"><Megaphone className="w-14 h-14 text-slate-600" /><p className="text-2xl font-black tracking-tight">WAITING FOR NEXT PLAYER</p></div>
              )}
            </div>

          </div>

          {/* ─ Right: Controls & Feed ─ */}
          <div className="lg:col-span-3 flex flex-col gap-2 sm:gap-2.5 lg:h-full min-h-0 order-2 lg:order-3">

            {/* Mobile-only: Competitors with expandable rosters */}
            <div className="lg:hidden bg-[#0D1424]/70 rounded-xl p-3 border border-white/[0.04]">
              <h3 className="text-[10px] text-slate-400 font-black mb-2 uppercase tracking-[0.15em] flex items-center gap-2"><Users className="w-3.5 h-3.5 text-blue-400" /> Competitors</h3>

              <div className="space-y-1.5">
                {leaderboard.map((member) => {
                  const memberPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && String(s.userId) === String(member.user.id) && !s.isUnsold));
                  const isExpanded = expandedMobileCompetitor === String(member.user.id);
                  return (
                    <div key={member.user.id} className={`rounded-lg border transition-all ${String(member.user.id) === String(user?.id) ? 'bg-indigo-500/8 border-indigo-500/25' : 'bg-white/[0.02] border-white/[0.04]'}`}>
                      <button
                        onClick={() => setExpandedMobileCompetitor(isExpanded ? null : String(member.user.id))}
                        className="w-full flex justify-between items-center px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{member.user.name}</p>
                          <span className="text-[10px] text-emerald-400/80 font-bold shrink-0">{formatPrice(member.budget)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] bg-black/40 font-mono text-slate-500 px-1.5 py-0.5 rounded">{memberPlayers.length}/25</span>
                          <ChevronRight className={`w-3 h-3 text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </div>
                      </button>
                      {isExpanded && memberPlayers.length > 0 && (
                        <div className="px-3 pb-2 flex flex-wrap gap-1">
                          {memberPlayers.map(p => <span key={p.id} title={p.name} className="text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded text-slate-400 font-bold border border-white/[0.05]">{p.name.split(' ').pop()}</span>)}
                        </div>
                      )}
                      {isExpanded && memberPlayers.length === 0 && (
                        <p className="px-3 pb-2 text-[9px] text-slate-700 italic">No players yet</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile-only: Chat */}
            <div className="lg:hidden bg-[#0D1424]/40 rounded-xl border border-white/[0.02] overflow-hidden">
              <button
                onClick={() => setMobileShowChat(!mobileShowChat)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#0D1424]/60"
              >
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Arena Chat</span>
                <ChevronRight className={`w-3.5 h-3.5 text-slate-600 transition-transform ${mobileShowChat ? 'rotate-90' : ''}`} />
              </button>
              {mobileShowChat && (
                <>
                  <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center opacity-20 text-center py-4">
                        <MessageSquare className="w-6 h-6 mb-1" />
                        <p className="font-bold uppercase tracking-[0.1em] text-[8px]">No messages yet</p>
                      </div>
                    )}
                    {chatMessages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${String(msg.user_id) === String(user?.id) ? 'items-end' : 'items-start'}`}>
                        <div className="max-w-[85%]">
                          <p className={`text-[8px] font-bold mb-0.5 uppercase tracking-wider opacity-30 px-1 ${String(msg.user_id) === String(user?.id) ? 'text-right' : 'text-left'}`}>{msg.user_name.split(' ')[0]}</p>
                          <div className={`px-3 py-1.5 rounded-xl text-[12px] shadow-sm border ${String(msg.user_id) === String(user?.id) ? 'bg-indigo-600 border-indigo-500/50 text-white rounded-tr-none' : 'bg-white/5 border-white/10 text-slate-200 rounded-tl-none'}`}>
                            <p className="font-bold leading-tight">{msg.text}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={mobileChatEndRef} />
                  </div>
                  <div className="px-2 py-2 bg-[#0D1424]/60 border-t border-white/[0.04]">
                    <div className="flex gap-1.5">
                      <input
                        type="text" value={msgInput} onChange={(e) => setMsgInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Chat..."
                        className="flex-1 bg-black/40 border border-white/[0.05] rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-700"
                      />
                      <button
                        onClick={handleSendMessage}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded-lg font-bold transition-all active:scale-95 flex items-center justify-center shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Admin Panel */}
            {isAdmin && roomDetails.status !== 'COMPLETED' && (
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
                  {!currentPlayer && (
                    <div className="flex gap-1.5 mt-2">
                      <button 
                        onClick={handleToggleOptionRound} 
                        className={`flex-1 py-2.5 rounded-lg font-bold text-[10px] uppercase transition-all border ${optionRoundActive ? 'bg-amber-500 text-black border-amber-400 animate-pulse' : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white'}`}
                      >
                        {optionRoundActive ? 'Option Round ON' : 'Start Option Round'}
                      </button>
                      <button onClick={handleEndAuction} className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-lg font-bold text-[10px] uppercase transition-all">Complete Auction</button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {roomDetails.status === 'COMPLETED' && (
              <div className="bg-gradient-to-br from-rose-500/20 to-indigo-600/20 rounded-xl p-4 border border-white/10 shrink-0 text-center shadow-xl">
                 <h3 className="text-lg font-black text-white italic tracking-tighter mb-1 uppercase">Auction Completed</h3>
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">All players auctioned • Teams finalized</p>
                 <button onClick={() => router.push('/')} className="w-full bg-white text-black py-2 rounded-lg font-bold text-xs hover:bg-slate-200 transition-all uppercase">Back to Menu</button>
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
