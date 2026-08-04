'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  LogOut,
  UserCheck,
  Menu,
  X,
  FileSpreadsheet,
  Users,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAdminChecked, setIsAdminChecked] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const userData = localStorage.getItem('admin_user');
    
    if (!token || !userData) {
      router.push('/admin_panel');
    } else {
      setUser(JSON.parse(userData));
      setIsAdminChecked(true);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    router.push('/admin_panel');
  };

  const navLinks = [
    { name: 'Genel Bakış', href: '/admin_panel/dashboard', icon: LayoutDashboard },
    { name: 'Değerlemeler', href: '/admin_panel/dashboard/valuations', icon: Sparkles },
    { name: 'Konsinyeler (CRM)', href: '/admin_panel/dashboard/consignments', icon: UserCheck },
    { name: 'Araç Talepleri', href: '/admin_panel/dashboard/vehicle-requests', icon: UploadCloud },
    { name: 'Çalışanlar & Yetki', href: '/admin_panel/dashboard/users', icon: Users },
    { name: 'Veri Yükleme', href: '/admin_panel/dashboard/import', icon: UploadCloud },
    { name: 'API Ayarları', href: '/admin_panel/dashboard/api-settings', icon: FileSpreadsheet },
    { name: 'Sistem Günlükleri', href: '/admin_panel/dashboard/logs', icon: ShieldAlert },
  ];

  if (!isAdminChecked) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh] bg-dark-bg text-zinc-400">
        Yetkilendirme kontrol ediliyor...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-[80vh] bg-dark-bg text-foreground">
      {/* Mobile Header */}
      <div className="md:hidden flex justify-between items-center bg-card-bg px-4 py-3.5 border-b border-border-gray">
        <span className="font-extrabold text-sm text-zinc-800 dark:text-white">NG GARAJ CONTROL</span>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Sidebar Panel */}
      <aside
        className={`md:w-64 bg-card-bg border-r border-border-gray flex flex-col justify-between py-6 px-4 shrink-0 transition-all ${
          mobileMenuOpen ? 'block' : 'hidden md:flex'
        }`}
      >
        <div className="flex flex-col gap-6">
          <div className="hidden md:flex items-center gap-2 border-b border-border-gray pb-4 px-2">
            <img
              src="/logo.png"
              alt="NakitGaraj Logo"
              className="h-9 w-auto object-contain"
            />
            <span className="text-[10px] uppercase font-bold text-zinc-450 dark:text-zinc-500 font-mono tracking-wider ml-1">Panel</span>
          </div>

          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                    isActive
                      ? 'bg-brand-orange/15 text-brand-orange border border-brand-orange/20 shadow-md shadow-brand-orange/5'
                      : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5 shrink-0" />
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="mt-8 border-t border-border-gray pt-4 flex flex-col gap-4 px-2">
          {user && (
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-800 dark:text-white">
                {user.firstName} {user.lastName}
              </span>
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">{user.email}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 w-full text-left cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main panel content wrapper */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
