'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, Car, LayoutDashboard, Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function Navbar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const navItems = [
    { name: t('nav.valuation'), href: '/degerleme', icon: Shield },
    { name: t('nav.consignment'), href: '/konsinye', icon: Car },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-zinc-800/10 dark:border-white/5 px-4 md:px-8 py-4 transition-all duration-300">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/logo.png"
            alt="NakitGaraj Logo"
            className="h-10 md:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-102"
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'text-brand-orange'
                    : 'text-zinc-500 dark:text-zinc-300 hover:text-brand-orange'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-zinc-800/10 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 transition-all border border-transparent hover:border-zinc-800/20 dark:hover:border-white/10"
            title={theme === 'light' ? 'Koyu Tema' : 'Açık Tema'}
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === 'tr' ? 'en' : 'tr')}
            className="p-2 rounded-lg hover:bg-zinc-800/10 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 transition-all border border-transparent hover:border-zinc-800/20 dark:hover:border-white/10 flex items-center gap-1.5 text-xs font-bold"
            title={language === 'tr' ? 'English' : 'Türkçe'}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="uppercase">{language}</span>
          </button>

          <Link
            href="/degerleme"
            className="hidden sm:inline-flex items-center justify-center bg-brand-orange hover:bg-brand-orange/90 text-white font-semibold text-xs px-4 py-2 rounded-xl transition-all duration-300 shadow-md shadow-brand-orange/20 cursor-pointer"
          >
            {t('wiz.step3.banner.btn')}
          </Link>
        </div>
      </div>
    </header>
  );
}
