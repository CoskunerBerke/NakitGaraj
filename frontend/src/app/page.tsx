'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Sparkles, CheckCircle2, ChevronRight, Zap, RefreshCw, BarChart4, X, User, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import TextType from '../components/reactbits/TextType';
import ShinyText from '../components/reactbits/ShinyText';
import SplitText from '../components/reactbits/SplitText';
import TestimonialsMarquee from '../components/reactbits/TestimonialsMarquee';


import SpotlightCard from '../components/reactbits/SpotlightCard';
import FloatingCarsBackground from '../components/reactbits/FloatingCarsBackground';

export default function Home() {
  const { t, language } = useLanguage();
  const router = useRouter();
  
  // Modal states for personal information collection
  const [showModal, setShowModal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleStartEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg(language === 'tr' ? 'Lütfen adınızı ve soyadınızı giriniz.' : 'Please enter your name and surname.');
      return;
    }

    const cleanedPhone = phone.replace(/[^0-9]/g, '');
    const isValidPhone = /^(05|5)\d{9}$/.test(cleanedPhone);

    if (!isValidPhone) {
      setErrorMsg(language === 'tr' ? 'Geçersiz telefon numarası girdiniz. Lütfen kontrol edip tekrar deneyiniz.' : 'Invalid phone number. Please check and try again.');
      return;
    }

    sessionStorage.setItem('preEval_firstName', firstName.trim());
    sessionStorage.setItem('preEval_lastName', lastName.trim());
    sessionStorage.setItem('preEval_phone', cleanedPhone);

    setShowModal(false);
    router.push('/degerleme');
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 70,
        damping: 15,
      },
    },
  };

  const stats = [
    {
      icon: Zap,
      title: language === 'tr' ? '94% Değerleme İsabeti' : '94% Valuation Accuracy',
      desc: language === 'tr' ? 'Gerçek pazar verileri' : 'Real market data',
    },
    {
      icon: RefreshCw,
      title: language === 'tr' ? 'Anlık Analiz' : 'Instant Analysis',
      desc: language === 'tr' ? 'Beklemeden, saniyeler içinde' : 'In seconds, without delay',
    },
    {
      icon: BarChart4,
      title: language === 'tr' ? 'Dinamik Algoritma' : 'Dynamic Algorithm',
      desc: language === 'tr' ? '14+ değişkenli hesaplama' : '14+ variable calculation',
    },
  ];

  const rotatingPhrasesTr = [
    'Saniyeler İçinde',
    'Gerçek Piyasa Verisiyle',
    'Tüm Marka & Modellerde',
    'Yapay Zeka Güvencesiyle',
  ];

  const rotatingPhrasesEn = [
    'In Seconds',
    'With Real Market Data',
    'Across All Makes & Models',
    'AI-Powered Precision',
  ];

  return (
    <div className="relative min-h-screen text-foreground overflow-hidden pb-16 flex flex-col justify-center bg-white dark:bg-zinc-950">
      {/* 10 Floating Driving Car Models Motion Background */}
      <FloatingCarsBackground />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 w-full pt-16 md:pt-24">
        {/* Header Hero Section */}
        <motion.div
          className="text-center max-w-3xl mx-auto flex flex-col items-center gap-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-sm text-xs font-semibold tracking-wide uppercase">
            <Sparkles className="w-4 h-4 text-brand-orange animate-pulse" />
            <ShinyText text={t('home.badge')} speed={4} className="font-bold text-xs" />
          </div>
          
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-tight text-zinc-900 dark:text-white flex flex-col items-center justify-center">
            <span className="block">
              {language === 'tr' ? 'Aracınızın Gerçek Değerini' : "Find Your Car's True Value"}
            </span>
            <div className="h-[48px] sm:h-[60px] md:h-[75px] flex items-center justify-center overflow-hidden mt-1">
              <span className="bg-gradient-to-r from-brand-orange to-rose-700 bg-clip-text text-transparent inline-flex items-center text-2xl sm:text-4xl md:text-5xl font-black whitespace-nowrap">
                <TextType
                  text={language === 'tr' ? rotatingPhrasesTr : rotatingPhrasesEn}
                  typingSpeed={75}
                  deletingSpeed={45}
                  pauseDuration={2200}
                  cursorChar="|"
                  className="font-black"
                  cursorClassName="text-brand-orange text-2xl sm:text-4xl md:text-5xl"
                />
              </span>
            </div>
          </h1>
          
          <p className="text-zinc-600 dark:text-zinc-400 text-base md:text-lg leading-relaxed max-w-2xl font-normal mt-2">
            <SplitText
              text={t('home.subtitle')}
              mode="words"
              stagger={0.03}
              delay={0.2}
            />
          </p>
        </motion.div>

        {/* Feature Stats widgets */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto mt-12 mb-16 text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {stats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                className="p-5 rounded-2xl glass-card flex flex-col items-center gap-2 border border-zinc-200 dark:border-white/5 shadow-md shadow-zinc-200/40 dark:shadow-none"
                variants={itemVariants}
              >
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-zinc-800 dark:text-white text-md mt-1">{stat.title}</h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">{stat.desc}</p>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Primary Interactive Choice Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Araç Değerleme Card */}
          <motion.div variants={itemVariants}>
            <SpotlightCard className="group rounded-3xl p-8 md:p-10 glass-card border border-zinc-200 dark:border-white/5 flex flex-col justify-between min-h-[400px] hover:border-brand-orange/40 shadow-xl shadow-zinc-200/50 dark:shadow-none">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange/10 rounded-bl-[100px] blur-[20px] pointer-events-none group-hover:bg-brand-orange/20 transition-all duration-500" />
              
              <div className="flex flex-col gap-4 relative z-20">
                <div className="w-12 h-12 rounded-2xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20 mb-2">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  {t('home.card1.title')}
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                  {t('home.card1.desc')}
                </p>
                
                <ul className="flex flex-col gap-3.5 mt-4">
                  {[
                    language === 'tr' ? 'Yapay zeka destekli detaylı fiyat aralığı' : 'AI-powered detailed price range',
                    language === 'tr' ? 'Türkiye hasar durumlarına uygun amortisman hesabı' : 'Depreciation calculations matching local standards',
                    language === 'tr' ? 'Benzer ilanlarla karşılaştırma ekranı' : 'Comparable live listing comparisons',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-4 relative z-20">
                <button
                  onClick={() => {
                    setFirstName(sessionStorage.getItem('preEval_firstName') || '');
                    setLastName(sessionStorage.getItem('preEval_lastName') || '');
                    setPhone(sessionStorage.getItem('preEval_phone') || '');
                    setShowModal(true);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 shadow-lg shadow-brand-orange/20 hover:shadow-brand-orange/45 hover:-translate-y-0.5 cursor-pointer"
                >
                  {t('home.card1.button')}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Konsinye Bırak Card */}
          <motion.div variants={itemVariants}>
            <SpotlightCard spotlightColor="rgba(16, 185, 129, 0.12)" className="group rounded-3xl p-8 md:p-10 glass-card border border-zinc-200 dark:border-white/5 flex flex-col justify-between min-h-[400px] hover:border-emerald-500/40 shadow-xl shadow-zinc-200/50 dark:shadow-none">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-[100px] blur-[20px] pointer-events-none group-hover:bg-emerald-500/20 transition-all duration-500" />
              
              <div className="flex flex-col gap-4 relative z-20">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-800 dark:text-white border border-zinc-200 dark:border-white/10 mb-2">
                  <ShieldAlert className="w-6 h-6 text-zinc-700 dark:text-zinc-300" />
                </div>
                <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                  {t('home.card2.title')}
                </h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">
                  {t('home.card2.desc')}
                </p>
                
                <ul className="flex flex-col gap-3.5 mt-4">
                  {[
                    language === 'tr' ? 'Zahmetsiz profesyonel satış yönetimi' : 'Effortless professional sales handling',
                    language === 'tr' ? 'Ekspertiz ve güvenli otopark hizmeti' : 'Inspection and secure garage parking services',
                    language === 'tr' ? 'CRM portalı üzerinden anlık teklif takibi' : 'Instant offer monitoring via our CRM portal',
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-4 relative z-20">
                <Link
                  href="/konsinye"
                  className="w-full inline-flex items-center justify-center gap-2 bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/15 text-zinc-900 dark:text-white font-bold py-4 px-6 rounded-2xl border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {t('home.card2.button')}
                  <ChevronRight className="w-5 h-5 text-zinc-400" />
                </Link>
              </div>
            </SpotlightCard>
          </motion.div>
        </motion.div>

        {/* Real Customer Testimonials Endless Left-To-Right Marquee */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mt-20 -mx-4 md:-mx-8"
        >
          <TestimonialsMarquee language={language} />
        </motion.div>
      </div>

      {/* Kişisel Bilgi Giriş Modalı */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-3xl p-6 md:p-8 max-w-md w-full border border-zinc-200 dark:border-white/10 relative shadow-2xl bg-white dark:bg-zinc-900"
            >
              <button
                onClick={() => {
                  setShowModal(false);
                  setErrorMsg('');
                }}
                className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Araç Değerleme Girişi</h3>
                  <p className="text-xs text-zinc-500">Değerleme işlemine başlamadan önce iletişim bilgilerinizi giriniz.</p>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs p-3.5 rounded-xl flex items-start gap-2.5 mb-4">
                  <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleStartEvaluation} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Ad</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Ahmet"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı ]/g, ''))}
                      className="glass-input rounded-xl p-3.5 text-sm w-full mt-1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Soyad</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Yılmaz"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı ]/g, ''))}
                      className="glass-input rounded-xl p-3.5 text-sm w-full mt-1"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Telefon Numarası</label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
                    <input
                      type="tel"
                      required
                      placeholder="05xx xxx xx xx"
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setPhone(digits);
                      }}
                      maxLength={11}
                      className="glass-input rounded-xl p-3.5 pl-10 text-sm w-full"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">Girdiğiniz numara güvenlik önlemlerimizle şifrelenerek korunur.</p>
                </div>

                <button
                  type="submit"
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 rounded-xl text-sm transition-all duration-300 w-full mt-2 cursor-pointer"
                >
                  Devam Et
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
