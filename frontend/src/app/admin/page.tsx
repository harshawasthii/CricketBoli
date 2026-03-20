'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Megaphone, Trophy, ChevronLeft } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

let socket: Socket;

export default function AdminPage() {
  const [matchId, setMatchId] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleAuthorize = () => {
    if (password === 'admin123') { // Simple password for now
      setIsAuthorized(true);
      setStatus(null);
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

      <div className="w-full max-w-2xl bg-slate-900 shadow-2xl border border-slate-700 rounded-3xl p-8 relative z-10">
        {!isAuthorized ? (
          <div className="flex flex-col items-center py-6">
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
          <div>
            <h1 className="text-3xl font-black mb-8 text-white uppercase flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg shadow-red-500/10 shrink-0">
                <img src="/logo.png" alt="CB" className="w-full h-full object-cover" />
              </div>
              Control Dashboard
            </h1>
            
            <div className="mb-10 p-6 bg-slate-800/50 rounded-2xl border border-slate-700 shadow-inner">
               <h2 className="text-xl font-bold mb-4 text-white flex items-center gap-2">
                 <Trophy className="w-5 h-5 text-amber-500" /> Scoring Engine Pipeline
               </h2>
               <p className="text-slate-400 mb-6 text-sm flex flex-col gap-2 font-medium">
                 <span>Trigger match-sync to:</span>
                 <li className="list-none">✓ Fetch real-time match stats</li>
                 <li className="list-none">✓ Parse points across all rosters</li>
                 <li className="list-none">✓ Global leaderboard recalculation</li>
               </p>
               
               {status && (
                 <div className={`p-4 mb-6 rounded-xl font-bold text-sm border ${
                   status.type === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/30' : 
                   status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 
                   'bg-blue-500/10 text-blue-500 border-blue-500/30'
                 }`}>
                   {status.message}
                 </div>
               )}

               <div className="flex flex-col sm:flex-row gap-3">
                 <input 
                   type="text" 
                   placeholder="Match ID (e.g., csk-vs-mi-01)"
                   value={matchId}
                   onChange={e => setMatchId(e.target.value)}
                   className="flex-1 bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-3.5 text-white font-bold focus:border-red-500 outline-none transition-all placeholder:text-slate-600"
                 />
                 <button 
                   onClick={handleSync}
                   className="bg-red-600 hover:bg-red-500 text-white px-8 py-3.5 rounded-2xl font-black shadow-lg shadow-red-500/20 transition-all hover:-translate-y-1 disabled:opacity-50"
                 >
                   COMPUTE SCORE
                 </button>
               </div>
            </div>

            <button onClick={() => router.push('/')} className="text-slate-400 hover:text-white transition-colors font-bold text-sm uppercase tracking-widest flex items-center gap-2 group">
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Exit Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
