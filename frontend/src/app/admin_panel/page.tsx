'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Mail, AlertCircle, Key, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır.'),
});

export default function AdminLogin() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: any) => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Giriş işlemi başarısız. Bilgilerinizi kontrol edin.');
      }

      const body = await res.json();
      localStorage.setItem('admin_token', body.accessToken);
      localStorage.setItem('admin_user', JSON.stringify(body.user));
      router.push('/admin_panel/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden bg-dark-bg min-h-[80vh]">
      {/* Glow Ambient background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-brand-orange/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-orange flex items-center justify-center">
              <span className="font-bold text-white text-md">NG</span>
            </div>
            <span className="font-extrabold text-zinc-900 dark:text-white text-md tracking-tight">
              NAKİT<span className="text-brand-orange">GARAJ</span>
            </span>
          </Link>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mt-2">Yönetici Paneli Girişi</h2>
          <p className="text-xs text-zinc-500">
            NakitGaraj yönetim sistemine erişmek için bilgilerinizi girin.
          </p>
        </div>

        <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-white/5 flex flex-col gap-6">
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">E-posta</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  {...register('email')}
                  placeholder="admin@nakitgaraj.com"
                  className="glass-input rounded-xl p-3.5 pl-10 text-sm w-full"
                />
              </div>
              {errors.email && (
                <span className="text-[11px] text-red-500 font-medium">{errors.email.message}</span>
              )}
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  {...register('password')}
                  placeholder="••••••••"
                  className="glass-input rounded-xl p-3.5 pl-10 text-sm w-full"
                />
              </div>
              {errors.password && (
                <span className="text-[11px] text-red-500 font-medium">{errors.password.message}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 rounded-xl text-sm transition-all duration-300 w-full mt-2 cursor-pointer"
            >
              {isLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        {/* Demo credentials hint */}
        <div className="text-center mt-6 p-4 bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 rounded-xl text-[11px] text-zinc-500">
          <span className="font-semibold text-zinc-650 dark:text-zinc-400">Demo Giriş Bilgileri:</span><br />
          E-posta: <span className="font-mono text-zinc-800 dark:text-zinc-300 font-bold">admin@nakitgaraj.com</span> | Şifre:{' '}
          <span className="font-mono text-zinc-800 dark:text-zinc-300 font-bold">Admin123!</span>
        </div>
      </div>
    </div>
  );
}
