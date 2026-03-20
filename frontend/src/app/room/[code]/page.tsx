'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchWithAuth } from '@/lib/api';
import { Trophy, History, Users, Wallet, AlertCircle, Megaphone, CheckCircle2, Play, Pause, ChevronRight } from 'lucide-react';

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
  const channelRef = useRef<any>(null);
  const timerIdRef = useRef<NodeJS.Timeout | null>(null);

  // Sound Effects System
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getAudioCtx = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return audioCtxRef.current;
  };

  const playSfx = (type: 'bid' | 'sold' | 'click' | 'warning') => {
    try {
      const ctx = getAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      // Short versions of the original SFX logic...
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(1200, ctx.currentTime); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); osc.start(); osc.stop(ctx.currentTime + 0.06); }
      if (type === 'bid') { osc.type = 'triangle'; osc.frequency.setValueAtTime(600, ctx.currentTime); gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); osc.start(); osc.stop(ctx.currentTime + 0.11); }
      if (type === 'sold') { osc.type = 'sine'; osc.frequency.setValueAtTime(1047, ctx.currentTime); gain.gain.setValueAtTime(0.3, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); osc.start(); osc.stop(ctx.currentTime + 0.51); }
      if (type === 'warning') { osc.type = 'sine'; osc.frequency.setValueAtTime(520, ctx.currentTime); gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); osc.start(); osc.stop(ctx.currentTime + 0.21); }
    } catch (e) {}
  };

  const addBidduMessage = (text: string) => {
    setBidduMessages(prev => [...prev.slice(-10), { id: Date.now(), text }]);
  };

  const initRoom = async () => {
    try {
      const [details, lead, allPlayers] = await Promise.all([
        fetchWithAuth(`/rooms/${params.code}`),
        fetchWithAuth(`/rooms/${params.code}/leaderboard`),
        fetchWithAuth(`/players/all`)
      ]);
      setRoomDetails(details);
      setLeaderboard(lead);
      setPlayers(allPlayers);
      
      const rebuiltEvents: any[] = [];
      if (details.rosters) details.rosters.forEach((r: any) => rebuiltEvents.push({ playerId: r.player_id, userId: r.user_id, amount: r.bought_for, isUnsold: false }));
      if (details.unsold) details.unsold.forEach((u: any) => rebuiltEvents.push({ playerId: u.player_id, amount: 0, isUnsold: true }));
      setSoldEvents(rebuiltEvents);
    } catch (err: any) {
      setErrorToast('Connection Error. Re-syncing...');
    }
  };

  // BROADCAST HELPER
  const sendRoomUpdate = (newState: any) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'auction_update',
      payload: newState
    });
  };

  // TIMER FOR ADMIN
  const startAdminTimer = (currentState: any) => {
    if (timerIdRef.current) clearTimeout(timerIdRef.current);
    
    let timerState = { ...currentState, status: 'IDLE' };
    setAuctionState(timerState);
    sendRoomUpdate(timerState);

    // 7s -> ONCE
    timerIdRef.current = setTimeout(() => {
      timerState = { ...timerState, status: 'ONCE' };
      setAuctionState(timerState);
      sendRoomUpdate(timerState);
      channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: 'Going ONCE!' });

      // 2s -> TWICE
      timerIdRef.current = setTimeout(() => {
        timerState = { ...timerState, status: 'TWICE' };
        setAuctionState(timerState);
        sendRoomUpdate(timerState);
        channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: 'Going TWICE!' });

        // 2s -> THRICE
        timerIdRef.current = setTimeout(() => {
          timerState = { ...timerState, status: 'THRICE' };
          setAuctionState(timerState);
          sendRoomUpdate(timerState);
          channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: 'Going THRICE!' });

          // 3s -> SOLD/UNSOLD
          timerIdRef.current = setTimeout(() => {
            finalizePlayer(timerState);
          }, 3000);
        }, 2000);
      }, 2000);
    }, 7000);
  };

  const finalizePlayer = async (state: any) => {
    if (!state.current_player_id) return;
    
    if (state.highest_bidder_id) {
       await fetchWithAuth(`/rooms/${params.code}/sold`, { 
         method: 'POST', 
         body: JSON.stringify({ playerId: state.current_player_id, buyerId: state.highest_bidder_id, amount: state.current_bid })
       });
       channelRef.current?.send({ type: 'broadcast', event: 'player_sold', payload: { playerId: state.current_player_id, userId: state.highest_bidder_id, amount: state.current_bid } });
    } else {
       await fetchWithAuth(`/rooms/${params.code}/unsold`, { method: 'POST', body: JSON.stringify({ playerId: state.current_player_id }) });
       channelRef.current?.send({ type: 'broadcast', event: 'player_unsold', payload: { playerId: state.current_player_id } });
    }
    setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
    sendRoomUpdate({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
    initRoom();
  };

  useEffect(() => {
    const userDataStr = localStorage.getItem('user');
    if (!userDataStr) { router.push('/login'); return; }
    const userData = JSON.parse(userDataStr);
    setUser(userData);
    initRoom();

    const channel = supabase.channel(`room_${params.code}`, {
      config: { broadcast: { self: false } }
    });
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
        setAuctionState((prev: any) => ({ ...prev, current_bid: payload.amount, highest_bidder_id: payload.userId }));
        playSfx('bid');
      })
      .on('broadcast', { event: 'player_sold' }, ({ payload }) => {
        setSoldEvents(prev => [...prev, payload]);
        setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
        playSfx('sold');
        setTimeout(initRoom, 500);
      })
      .on('broadcast', { event: 'player_unsold' }, ({ payload }) => {
         setSoldEvents(prev => [...prev, { playerId: payload.playerId, amount: 0, isUnsold: true }]);
         setAuctionState({ current_player_id: null, current_bid: 0, highest_bidder_id: null, status: 'IDLE' });
      })
      .subscribe();

    return () => { channel.unsubscribe(); if(timerIdRef.current) clearTimeout(timerIdRef.current); };
  }, [params.code]);

  const handleStartAuction = (playerId: number) => {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    let baseStr = String(player.base_price).toLowerCase().trim();
    let num = parseFloat(baseStr.replace(/[^0-9.]/g, '')) || 0;
    let actualBase = baseStr.includes('cr') ? Math.round(num * 10000000) : (baseStr.includes('l') ? Math.round(num * 100000) : num);

    const newState = { current_player_id: playerId, current_bid: actualBase, highest_bidder_id: null, status: 'IDLE' };
    setAuctionState(newState);
    setBidAmount(actualBase);
    
    channelRef.current?.send({ type: 'broadcast', event: 'biddu_msg', payload: `Up next: ${player.name} at Base Price ${player.base_price}` });
    startAdminTimer(newState);
    playSfx('click');
  };

  const handlePlaceBid = async (forcedAmount?: number) => {
    if (Date.now() - lastBidTime.current < 500) return;
    lastBidTime.current = Date.now();

    const amt = typeof forcedAmount === 'number' ? forcedAmount : Number(bidAmount);
    try {
      await fetchWithAuth(`/rooms/${params.code}/bid`, { 
        method: 'POST', 
        body: JSON.stringify({ amount: amt, playerId: auctionState.current_player_id }) 
      });
      
      const newState = { ...auctionState, current_bid: amt, highest_bidder_id: user.id };
      setAuctionState(newState);
      channelRef.current?.send({ type: 'broadcast', event: 'new_bid', payload: { userId: user.id, amount: amt } });
      playSfx('bid');
      
      if (roomDetails.admin_id === user.id) startAdminTimer(newState);
    } catch (err: any) {
      setErrorToast(err.message);
      setTimeout(() => setErrorToast(''), 4000);
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

  const availablePlayers = players ? players.filter(p => optionRoundActive ? soldEvents.find(s => s.playerId === p.id && s.isUnsold) : !soldEvents.find(s => s.playerId === p.id)) : [];
  const myBoughtPlayers = players.filter(p => soldEvents.some(s => s.playerId === p.id && s.userId === user?.id && !s.isUnsold));
  const myOverseasCount = myBoughtPlayers.filter(p => p.nationality_type?.toLowerCase() === 'overseas').length;

  const handleStartNextPlayer = () => availablePlayers.length > 0 ? handleStartAuction(availablePlayers[0].id) : setErrorToast('No players left!');

  // Render Logic (Keeping the same UI structure as requested)
  if (!roomDetails || !user) return <div className="min-h-screen bg-[#0B1120] text-white flex flex-col items-center justify-center font-bold text-2xl gap-8 animate-pulse italic">Entering CricketBoli Arena...</div>;

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#0B1120] text-white font-sans p-4 md:p-6 lg:p-8 relative flex flex-col items-center">
      {errorToast && <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-red-600/90 text-white px-8 py-4 rounded-full z-50 flex items-center gap-3 animate-bounce border border-red-400 font-bold">{errorToast}</div>}
      
      <div className="w-full max-w-screen-2xl bg-slate-900/40 backdrop-blur-xl border-b border-white/5 px-8 h-20 flex items-center justify-between shrink-0 rounded-3xl mb-6 shadow-2xl">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => router.push('/')}>
            <div className="w-14 h-14 bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-2xl p-1 shadow-2xl"><img src="/logo.png" className="w-full h-full object-cover rounded-xl" /></div>
            <div className="flex flex-col"><h1 className="text-3xl font-black italic tracking-tighter leading-none">CricketBoli</h1><span className="text-[10px] text-amber-500 font-bold uppercase tracking-[0.2em] mt-1 ml-1 leading-none">{params.code}</span></div>
          </div>
          <div className="flex items-center gap-6 bg-slate-800/80 px-6 py-3 rounded-2xl border border-white/5 shadow-2xl">
            <Wallet className="w-6 h-6 text-emerald-400" /><div className="text-right"><p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-black">My Budget</p><p className="text-2xl font-black text-white">{formatPrice(myMembership?.budget || 0)}</p></div>
          </div>
      </div>

      <div className="w-full max-w-screen-2xl flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10 lg:min-h-0">
        <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:min-h-0 order-2 lg:order-1">
          <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-700/50 shadow-2xl flex-1 flex flex-col min-h-0">
             <h3 className="text-white font-black mb-6 uppercase tracking-widest text-xs flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" /> Standings</h3>
             <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
               {leaderboard.map((member) => (
                 <div key={member.user.id} className={`p-4 rounded-2xl border transition-all ${member.user.id === user?.id ? 'bg-indigo-500/10 border-indigo-500/40' : 'bg-slate-800/40 border-slate-700/50'}`}>
                    <p className="text-sm font-black text-white uppercase">{member.user.name}</p>
                    <p className="text-[10px] text-emerald-400 font-bold truncate">{formatPrice(member.budget)}</p>
                 </div>
               ))}
             </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col gap-6 lg:h-full lg:min-h-0 order-1 lg:order-2">
           <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 p-6 rounded-3xl border border-blue-500/30 flex items-start gap-5">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl border-2 border-blue-400 p-1 flex-shrink-0"><img src="/logo.png" /></div>
              <div className="flex-1 min-w-0 h-[70px] overflow-y-auto custom-scrollbar">
                {bidduMessages.map((msg) => <div key={msg.id} className="text-xl text-white font-bold">{msg.text}</div>)}
              </div>
           </div>

           <div className="bg-slate-900/60 rounded-3xl p-6 flex-1 w-full flex flex-col items-center justify-center shadow-2xl relative overflow-hidden">
            {currentPlayer ? (
              <div className="text-center w-full max-w-3xl flex flex-col items-center justify-between h-full py-2">
                <div>
                  <div className="flex justify-center gap-3 mb-2">
                    <span className="px-4 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold">{currentPlayer.role}</span>
                    <span className={`px-4 py-1 rounded-full text-xs font-bold ${currentPlayer.nationality_type?.toLowerCase() === 'overseas' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{currentPlayer.nationality_type}</span>
                  </div>
                  <h2 className="text-4xl lg:text-5xl font-black text-white px-2 break-words leading-tight">{currentPlayer.name}</h2>
                </div>

                <div className={`w-full max-w-2xl bg-slate-950/80 rounded-[28px] p-6 border ${auctionState.highest_bidder_id === user.id ? 'border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.2)]' : 'border-slate-800'}`}>
                   {auctionState.status === 'PAUSED' && <div className="text-amber-400 font-black text-xs mb-2">PAUSED</div>}
                   <p className="text-[11px] text-amber-500/80 mb-1 uppercase tracking-widest font-black">Current Price</p>
                   <p className="text-5xl lg:text-7xl font-black text-amber-400 mb-4">{formatPrice(auctionState.current_bid)}</p>
                   <div className="mb-6 h-6 flex justify-center">
                    {auctionState.highest_bidder_id && <span className="bg-amber-500/10 px-4 py-1 rounded-full text-amber-300 font-bold border border-amber-500/20">by {leaderboard.find(l => l.user.id === auctionState.highest_bidder_id)?.user.name || 'Anonymous'}</span>}
                   </div>
                   
                   <div className="grid grid-cols-5 gap-2">
                      {[10, 30, 50, 75, 100].map((v) => (
                        <button key={v} onClick={() => handlePlaceBid(auctionState.current_bid + (v * 100000))} className="bg-slate-900 border-2 border-slate-700 hover:border-amber-400 text-white hover:text-amber-400 rounded-xl py-4 font-black text-xs">+{v}L</button>
                      ))}
                   </div>
                </div>
              </div>
            ) : (
                <div className="text-center opacity-40"><p className="text-3xl font-black mb-2">Awaiting Arena...</p></div>
            )}
           </div>
        </div>

        <div className="lg:col-span-3 flex flex-col gap-6 lg:h-full lg:min-h-0 order-3">
          {isAdmin && (
            <div className="bg-slate-900/60 rounded-3xl p-6 border border-emerald-500/20 shadow-xl">
               <button onClick={handleStartNextPlayer} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-black mb-4 gap-2 flex items-center justify-center">Next Player <ChevronRight /></button>
               <button onClick={() => setOptionRoundActive(!optionRoundActive)} className={`w-full py-3 rounded-xl font-bold uppercase ${optionRoundActive?'bg-amber-500 text-slate-900':'bg-slate-800 text-slate-500'}`}>Option Round</button>
            </div>
          )}
          <div className="bg-slate-900/60 rounded-3xl p-6 border border-slate-700/50 shadow-xl flex-1 flex flex-col min-h-0">
             <h3 className="text-white font-black mb-6 uppercase tracking-widest text-sm flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-400" /> Auction Feed</h3>
             <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
               {soldEvents.slice(-5).reverse().map((ev, i) => {
                 const p = players.find(x => x.id === ev.playerId);
                 return (
                   <div key={i} className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50 flex justify-between items-center group">
                      <div className="truncate pr-2"><p className="text-sm font-black text-slate-200 truncate">{p?.name}</p><p className="text-[10px] text-slate-500 truncate">{ev.userId ? leaderboard.find(l => l.user.id === ev.userId)?.user.name : 'Unsold'}</p></div>
                      <span className="text-xs font-black text-amber-400 whitespace-nowrap">{ev.amount > 0 ? formatPrice(ev.amount) : 'UNSOLD'}</span>
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
