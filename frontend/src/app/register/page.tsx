'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await fetchWithAuth('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
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
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      <svg viewBox="0 0 100 100" className="w-[300px] h-[300px] opacity-[0.03] text-indigo-500 absolute bottom-10 left-[-100px] -rotate-12 pointer-events-none" fill="currentColor">
        <rect x="30" y="10" width="6" height="80" rx="3" />
        <rect x="47" y="10" width="6" height="80" rx="3" />
        <rect x="64" y="10" width="6" height="80" rx="3" />
      </svg>
      <div className="mb-8 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-700 relative z-10">
        <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden border border-slate-700">
           <img src="/logo.png" alt="CricketBoli Robot" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-4xl font-black bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic tracking-tight pr-2">CricketBoli</h1>
      </div>
      <div className="w-full max-w-md p-10 bg-slate-800 rounded-3xl shadow-2xl border border-slate-700/50">
        <h2 className="text-2xl font-bold text-center text-white mb-8 uppercase tracking-widest opacity-80">Create Account</h2>
        {error && <div className="p-3 mb-6 text-sm text-red-400 bg-red-400/10 rounded-lg">{error}</div>}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-all"
              required
            />
          </div>
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
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 mt-2"
          >
            Register
          </button>
        </form>
        <p className="mt-6 text-center text-slate-400 text-sm">
          Already have an account? <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium">Sign in</a>
        </p>
      </div>
    </div>
  );
}
