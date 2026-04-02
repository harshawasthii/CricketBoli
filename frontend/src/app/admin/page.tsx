'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Megaphone, Trophy, ChevronLeft, List, Hash, Users, Activity, Clock } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

let socket: Socket;

export default function AdminPage() {
  const [matchId, setMatchId] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const fetchAllRooms = async () => {
    try {
      const data = await fetchWithAuth('/admin/rooms');
      setRooms(data);
    } catch (err: any) {
      console.error('Failed to fetch rooms:', err);
    }
  };

  const handleAuthorize = () => {
    if (password === 'admin123') { // Simple password for now
      setIsAuthorized(true);
      setStatus(null);
      fetchAllRooms();
    } else {
      setStatus({ type: 'error', message: 'Invalid Admin Password' });
    }
  };

  const handleSync = async () => {
    if (!matchId) return setStatus({ type: 'error', message: 'Match ID is required' });
    
    setStatus({ type: 'info', message: 'Syncing match data from RapidAPI...' });
    try {
      await fetchWithAuth(`/admin/update-match/${matchId}`, {
        method: 'POST'
      });
      setStatus({ type: 'success', message: `Match ${matchId} synced successfully. Leaderboards updated.` });
      setMatchId('');
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-white p-6 md:p-12 relative overflow-hidden flex flex-col items-center justify-center font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-4xl bg-slate-900 shadow-2xl border border-slate-700 rounded-3xl p-8 relative z-10 transition-all">
        {!isAuthorized ? (
          <div className="flex flex-col items-center py-6 max-w-md mx-auto">
            <h1 className="text-3xl font-black mb-2 text-white uppercase tracking-tight">Admin <span className="text-red-500 underline decoration-red-500/30 underline-offset-8 decoration-4">Gateway</span></h1>
            <p className="text-slate-400 font-medium mb-8">Access restricted to authorized auctioneers.</p>
            
            {status && <p className="mb-4 text-rose-500 font-bold text-sm bg-rose-500/10 px-4 py-2 rounded-lg border border-rose-500/20">{status.message}</p>}

            <div className="w-full space-y-4">
              <input 
                type="password" 
                placeholder="Enter Admin Access Code"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuthorize()}
                className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 text-white text-xl font-bold focus:border-red-500 outline-none transition-all placeholder:text-slate-600 focus:ring-4 focus:ring-red-500/20"
              />
              <button 
                onClick={handleAuthorize}
                className="w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-red-500/20 hover:-translate-y-1 block active:scale-95"
              >
                AUTHORIZE ACCESS
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-8">
               <h1 className="text-3xl font-black text-white uppercase flex items-center gap-3">
                 <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg shadow-red-500/10 shrink-0">
                   <img src="/logo.png" alt="CB" className="w-full h-full object-cover" />
                 </div>
                 Control Dashboard
               </h1>
               <button onClick={() => router.push('/')} className="text-slate-400 hover:text-white transition-colors font-bold text-sm uppercase tracking-widest flex items-center gap-2 group">
                 <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Exit Dashboard
               </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 shadow-inner">
                 <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                   <Trophy className="w-5 h-5 text-amber-500" /> Scoring Pipeline
                 </h2>
                 
                 {status && (
                   <div className={`p-4 mb-6 rounded-xl font-bold text-sm border ${
                     status.type === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 
                     status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 
                     'bg-blue-500/10 text-blue-500 border-blue-500/30'
                   }`}>
                     {status.message}
                   </div>
                 )}

                 <div className="flex flex-col gap-3">
                   <input 
                     type="text" 
                     placeholder="Match ID (e.g., csk-vs-mi-01)"
                     value={matchId}
                     onChange={e => setMatchId(e.target.value)}
                     className="bg-slate-900 border-2 border-slate-700 rounded-xl px-5 py-3 text-white font-bold focus:border-red-500 outline-none transition-all placeholder:text-slate-600"
                   />
                   <button 
                     onClick={handleSync}
                     className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-red-500/20 transition-all hover:-translate-y-1 block"
                   >
                     COMPUTE GLOBAL SCORES
                   </button>
                 </div>
              </div>

              <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700 flex flex-col justify-center">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                        <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-1">Total Rooms</p>
                        <p className="text-3xl font-black text-white">{rooms.length}</p>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                        <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-1">Active Now</p>
                        <p className="text-3xl font-black text-emerald-400">{rooms.filter(r => r.status === 'WAITING').length}</p>
                    </div>
                 </div>
              </div>
            </div>

            <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden">
               <div className="p-6 border-b border-white/5 flex justify-between items-center">
                  <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                    <List className="w-5 h-5 text-indigo-400" /> Live Auctions Registry
                  </h3>
                  <button onClick={fetchAllRooms} className="text-xs font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest">Refresh Data</button>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                       <tr className="border-b border-white/5 bg-white/5">
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Room Code</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Admin</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Participants</th>
                          <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Rosters</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                       {rooms.map(room => (
                         <tr key={room.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-5">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                     <Hash className="w-4 h-4 text-indigo-400" />
                                  </div>
                                  <span className="font-black text-white text-lg group-hover:text-indigo-400 transition-colors">{room.code}</span>
                               </div>
                            </td>
                            <td className="px-6 py-5">
                               <p className="font-bold text-slate-300 text-sm">{room.admin?.name || 'Unknown'}</p>
                               <p className="text-[10px] text-slate-500 font-medium">{room.admin?.email || '-'}</p>
                            </td>
                            <td className="px-6 py-5">
                               <span className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest uppercase border ${
                                 room.status === 'COMPLETED' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                                 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                               }`}>
                                 {room.status}
                               </span>
                            </td>
                            <td className="px-6 py-5 text-center">
                               <div className="inline-flex items-center gap-1.5 font-bold text-slate-300">
                                  <Users className="w-3.5 h-3.5 opacity-50" />
                                  {room.participantCount}
                               </div>
                            </td>
                            <td className="px-6 py-5 text-center font-bold text-slate-500 text-sm">
                               {room.rosterCount}
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
