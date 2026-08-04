'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer id="contact" className="w-full bg-[#070709] border-t border-zinc-800/80 py-12 px-4 md:px-8 mt-auto text-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center">
              <span className="font-bold text-white text-sm">NG</span>
            </div>
            <span className="font-extrabold text-white text-lg tracking-tight">
              NAKİT<span className="text-brand-orange">GARAJ</span>
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {t('footer.desc')}
          </p>

          {/* Instagram Button */}
          <div className="flex items-center gap-3 mt-1">
            <a
              href="https://www.instagram.com/nakit_garaj/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
              <span>@nakit_garaj</span>
            </a>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white mb-4">
            {t('nav.home')}
          </h4>
          <ul className="flex flex-col gap-2.5 text-xs text-zinc-400">
            <li>
              <Link href="/degerleme" className="hover:text-brand-orange transition-colors">
                {t('nav.valuation')}
              </Link>
            </li>
            <li>
              <Link href="/konsinye" className="hover:text-brand-orange transition-colors">
                {t('nav.consignment')}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-white mb-4">Kurumsal</h4>
          <ul className="flex flex-col gap-2.5 text-xs text-zinc-400">
            <li>
              <a href="#" className="hover:text-brand-orange transition-colors">
                Hakkımızda
              </a>
            </li>
            <li>
              <a href="#" className="hover:text-brand-orange transition-colors">
                Kullanım Şartları
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4">İLETİŞİM</h4>
          <ul className="flex flex-col gap-3.5 text-xs">
            <li className="flex items-start gap-2.5 text-zinc-300">
              <div className="w-7 h-7 rounded-lg bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20 shrink-0 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <span className="font-medium text-xs text-zinc-300 leading-relaxed">
                Mevlana Bulvarı Kızılırmak Mahallesi 150/2 Çukurambar, Ankara, Turkey
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20 shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <a
                href="tel:+905521529292"
                className="text-white font-black text-base hover:text-brand-orange transition-colors tracking-tight"
              >
                +90 552 152 92 92
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto border-t border-zinc-800/60 mt-8 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-[11px] text-zinc-400">
          © {new Date().getFullYear()} NakitGaraj. {t('footer.rights')}
        </p>
        <p className="text-[10px] text-zinc-400">
          Lütfen Dikkat: Bu web sitesi benzersiz bir arayüze ve bağımsız bir tasarıma sahip bir eğitim/portfolyo çalışmasıdır.
        </p>
      </div>
    </footer>
  );
}
