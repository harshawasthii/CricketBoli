'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await fetchWithAuth('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0B1120] px-6 relative overflow-hidden">
      {/* Background Aesthetics */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <svg viewBox="0 0 100 100" className="w-[300px] h-[300px] opacity-[0.03] text-blue-500 absolute top-10 right-[-100px] rotate-45 pointer-events-none" fill="currentColor">
        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M 20 20 Q 50 50 20 80 M 80 20 Q 50 50 80 80" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
      <div className="mb-8 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-700 relative z-10">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border border-slate-700">
           <img src="/logo.png" alt="CricketBoli Robot" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic tracking-tight pr-2">CricketBoli</h1>
      </div>
      <div className="w-full max-w-md p-10 bg-slate-800 rounded-3xl shadow-2xl border border-slate-700/50">
        <h2 className="text-2xl font-bold text-center text-white mb-8 uppercase tracking-widest opacity-80">Sign In</h2>
        {error && <div className="p-3 mb-6 text-sm text-red-400 bg-red-400/10 rounded-lg">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-all"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
          >
            Sign In
          </button>
        </form>
        <p className="mt-6 text-center text-slate-400 text-sm">
          Don't have an account? <a href="/register" className="text-blue-400 hover:text-blue-300 font-medium">Create one</a>
        </p>
      </div>
    </div>
  );
}
