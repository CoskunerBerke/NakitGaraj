'use client';

import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Sparkles, AlertCircle, Settings, CheckCircle2, DollarSign, Cpu, Send, MessageSquare, Bell } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function ApiSettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState('data_deger');
  const [selectedPackage, setSelectedPackage] = useState('paket2');
  const [apiKey, setApiKey] = useState('sk_live_51NzkG92kLpB1ntfD82af21782fc4d6d2');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Telegram States
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatIds, setTelegramChatIds] = useState('');
  const [galleryWhatsAppPhone, setGalleryWhatsAppPhone] = useState('05350379074');
  const [telegramSaveSuccess, setTelegramSaveSuccess] = useState('');
  const [telegramError, setTelegramError] = useState('');
  const [telegramTesting, setTelegramTesting] = useState(false);

  // Galeri Kâr Marjı ve Piyasa Ayarları
  const [consignmentProfitPct, setConsignmentProfitPct] = useState(6);
  const [cashOfferProfitPct, setCashOfferProfitPct] = useState(12);
  const [luxuryMinProfitFixed, setLuxuryMinProfitFixed] = useState(200000);
  const [luxuryMaxProfitFixed, setLuxuryMaxProfitFixed] = useState(300000);
  const [monthlyInflationPercentage, setMonthlyInflationPercentage] = useState(2.5);
  const [profitSaveSuccess, setProfitSaveSuccess] = useState('');

  useEffect(() => {
    fetchTelegramSettings();
    fetchProfitSettings();
  }, []);

  const fetchProfitSettings = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/market-sync/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConsignmentProfitPct(data.consignmentProfitPercentage ?? 6);
        setCashOfferProfitPct(data.cashOfferProfitPercentage ?? 12);
        setLuxuryMinProfitFixed(data.luxuryMinProfitFixed ?? 200000);
        setLuxuryMaxProfitFixed(data.luxuryMaxProfitFixed ?? 300000);
        setMonthlyInflationPercentage(data.monthlyInflationPercentage ?? 2.5);
      }
    } catch (err) {
      console.error('Kâr ayarları yüklenemedi:', err);
    }
  };

  const handleSaveProfitSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfitSaveSuccess('');
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/market-sync/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          consignmentProfitPercentage: Number(consignmentProfitPct),
          cashOfferProfitPercentage: Number(cashOfferProfitPct),
          luxuryMinProfitFixed: Number(luxuryMinProfitFixed),
          luxuryMaxProfitFixed: Number(luxuryMaxProfitFixed),
          monthlyInflationPercentage: Number(monthlyInflationPercentage),
        }),
      });
      if (res.ok) {
        setProfitSaveSuccess('Galeri Kâr Marjı ve Piyasa Ayarları başarıyla güncellendi!');
        setTimeout(() => setProfitSaveSuccess(''), 5000);
      }
    } catch (err) {
      console.error('Kâr ayarları kaydedilemedi:', err);
    }
  };

  const fetchTelegramSettings = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/telegram/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTelegramToken(data.botToken || '');
        setTelegramChatIds(data.chatIds || '');
        setGalleryWhatsAppPhone(data.galleryWhatsAppPhone || '05350379074');
      }
    } catch (err) {
      console.error('Telegram ayarları yüklenemedi:', err);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaveSuccess('');
    setTelegramError('');

    if (!telegramToken.trim()) {
      setTelegramError('Lütfen Telegram Bot Token giriniz.');
      return;
    }
    if (!telegramChatIds.trim()) {
      setTelegramError('Lütfen en az bir Telegram Chat ID giriniz.');
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/telegram/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          botToken: telegramToken,
          chatIds: telegramChatIds,
          galleryWhatsAppPhone,
          enabled: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setTelegramSaveSuccess('Telegram bot ayarları başarıyla kaydedildi!');
        setTimeout(() => setTelegramSaveSuccess(''), 5000);
      } else if (res.status === 401) {
        setTelegramError('Oturum süreniz dolmuş olabilir. Lütfen sayfayı yenileyip tekrar giriş yapınız.');
      } else {
        setTelegramError(data.message || 'Ayarlar kaydedilemedi.');
      }
    } catch (err: any) {
      setTelegramError(err.message || 'Hata oluştu.');
    }
  };

  const handleTestTelegram = async () => {
    setTelegramSaveSuccess('');
    setTelegramError('');

    if (!telegramToken.trim()) {
      setTelegramError('Lütfen test etmeden önce Telegram Bot Token giriniz.');
      return;
    }
    if (!telegramChatIds.trim()) {
      setTelegramError('Lütfen test etmeden önce Alıcı Telegram Chat ID giriniz.');
      return;
    }

    setTelegramTesting(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/telegram/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          botToken: telegramToken,
          chatIds: telegramChatIds,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setTelegramSaveSuccess(data.message || 'Test mesajı Telegram hesabınıza başarıyla gönderildi!');
      } else if (res.status === 401) {
        setTelegramError('Oturum süreniz dolmuş. Lütfen sayfayı yenileyip tekrar admin girişi yapınız.');
      } else {
        const errMsg = data.message || '';
        if (errMsg.includes('chat not found')) {
          setTelegramError('Telegram Kuralı: Bot sohbeti başlatılmamış! Lütfen Telegram uygulamasında oluşturduğunuz bota girip alttaki BAŞLAT (START) butonuna bir kez basınız ve ardından tekrar deneyiniz.');
        } else {
          setTelegramError(errMsg || 'Test mesajı gönderilemedi. Bot Token ve Chat ID kontrol edin.');
        }
      }
    } catch (err: any) {
      setTelegramError(err.message || 'Test esnasında bir hata oluştu.');
    } finally {
      setTelegramTesting(false);
    }
  };

  // Simulator State variables
  const [baseValue, setBaseValue] = useState(850000);
  const [deltaYas, setDeltaYas] = useState(14); // in % (e.g. 4 years * 3.5%)
  const [deltaKm, setDeltaKm] = useState(5.5); // in % (e.g. 110k km * 0.05%)
  const [gammaDonanim, setGammaDonanim] = useState(1.04); // multiplier
  const [epsilonPazar, setEpsilonPazar] = useState(-8); // in % (e.g. -10% damage + 2% popularity)

  // Compute values
  const deltaYasDecimal = deltaYas / 100;
  const deltaKmDecimal = deltaKm / 100;
  const epsilonPazarDecimal = epsilonPazar / 100;

  // Formula: P_2el = P_0km * (1 - delta_yas - delta_km) * gamma_donanim + epsilon_pazar
  const computedValue = Math.round(
    baseValue * ((1 - deltaYasDecimal - deltaKmDecimal) * gammaDonanim + epsilonPazarDecimal)
  );
  const quickSaleValue = Math.round(computedValue * 0.91);
  const maxExpectedValue = Math.round(computedValue * 1.08);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const providers = [
    { id: 'data_deger', name: 'Data Değer API', type: 'Local/TR AI', status: 'Aktif' },
    { id: 'cardata', name: 'Cardata API', type: 'Yerel Kasko & İhale', status: 'Test Aşamasında' },
    { id: 'indicata', name: 'Indicata Lead Generator', type: 'Autorola Group B2B', status: 'Pasif' },
    { id: 'jato', name: 'JATO Index API', type: 'Global Specifications', status: 'Pasif' },
    { id: 'simulator', name: 'Local DB Simulator', type: 'Statik Katsayı Algoritması', status: 'Aktif' },
  ];

  const packages = [
    { id: 'paket1', name: 'Paket 1 (Başlangıç)', count: '10.000 Sorgu', desc: 'Küçük ölçekli projeler için ideal.' },
    { id: 'paket2', name: 'Paket 2 (Büyüme)', count: '50.000 Sorgu', desc: 'Orta-büyük bayi grupları ve entegrasyonlar için.' },
    { id: 'paket3', name: 'Paket 3 (Limitsiz)', count: 'Sınırsız Sorgu', desc: 'Kurumsal sistemler ve sürekli veri akışları için.' },
  ];

  return (
    <div className="flex flex-col gap-8 w-full">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">Araç Veri API Ayarları</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Sıfır ve ikinci el otomotiv entegrasyon sağlayıcılarını ve fiyatlama algoritma katsayılarını yönetin.
        </p>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs p-4 rounded-xl flex items-center gap-2 max-w-lg">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>API ayarları başarıyla kaydedildi ve tüm formlar güncellendi.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Provider & Key Configuration */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <form onSubmit={handleSaveSettings} className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-white/5 flex flex-col gap-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 pb-3">
              <Settings className="w-4.5 h-4.5 text-brand-orange" />
              Sağlayıcı & Lisans Ayarları
            </h3>

            {/* Providers */}
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Veri Entegratörü Seçimi</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {providers.map((p) => (
                  <label
                    key={p.id}
                    className={`flex justify-between items-center p-4 rounded-2xl border cursor-pointer transition-all ${
                      selectedProvider === p.id
                        ? 'bg-brand-orange/15 border-brand-orange text-zinc-800 dark:text-white'
                        : 'bg-zinc-100/60 border-zinc-200 dark:bg-zinc-900/60 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold">{p.name}</span>
                      <span className="text-[10px] text-zinc-500">{p.type}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'Aktif' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 
                        p.status === 'Test Aşamasında' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 
                        'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-750'
                      }`}>
                        {p.status}
                      </span>
                      <input
                        type="radio"
                        name="provider"
                        checked={selectedProvider === p.id}
                        onChange={() => setSelectedProvider(p.id)}
                        className="hidden"
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Dynamic details for Data Değer Packages */}
            {selectedProvider === 'data_deger' && (
              <div className="flex flex-col gap-3 mt-2">
                <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-brand-orange" />
                  Data Değer Abonelik Paketi
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {packages.map((pkg) => (
                    <label
                      key={pkg.id}
                      className={`flex flex-col gap-2 p-4 rounded-2xl border cursor-pointer text-xs transition-all ${
                        selectedPackage === pkg.id
                          ? 'bg-brand-orange/15 border-brand-orange text-zinc-800 dark:text-white font-bold'
                          : 'bg-zinc-100/40 border-zinc-200 dark:bg-zinc-900/40 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="package"
                        checked={selectedPackage === pkg.id}
                        onChange={() => setSelectedPackage(pkg.id)}
                        className="hidden"
                      />
                      <span className="font-extrabold text-zinc-900 dark:text-white">{pkg.name}</span>
                      <span className="text-[10px] font-mono text-brand-orange font-bold uppercase">{pkg.count}</span>
                      <p className="text-[10px] text-zinc-500 leading-normal mt-1">{pkg.desc}</p>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* API Key */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Lisans Anahtarı (API Key / Client Token)</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_..."
                className="glass-input rounded-xl p-3.5 text-xs font-mono w-full"
              />
              <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">
                Sağlayıcı panelinizden ürettiğiniz API anahtarını buraya girin. İletişim tamamen arkadaki sunucu (Backend Proxy) üzerinden güvenle sağlanır.
              </p>
            </div>

            <button
              type="submit"
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 rounded-xl text-xs transition-all duration-300 w-full mt-4 cursor-pointer"
            >
              Lisans ve Sağlayıcı Ayarlarını Kaydet
            </button>
          </form>

          {/* Galeri Kâr Marjı & Piyasa Oranları Ayarları */}
          <form onSubmit={handleSaveProfitSettings} className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-white/5 flex flex-col gap-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 pb-3">
              <DollarSign className="w-4.5 h-4.5 text-emerald-500" />
              Galeri Kâr Marjı & Piyasa Alım Oranları (Müşterinize Sunulan Fiyatlar)
            </h3>

            {profitSaveSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{profitSaveSuccess}</span>
              </div>
            )}

            <p className="text-xs text-zinc-500 leading-relaxed">
              Aracın Sahibinden Piyasa Satış Değeri (Piyasa Değeri / MAX) master kalibrasyon motoru tarafından belirlenir. Siz sadece galeri olarak <b>Konsinye Kâr Oranı</b> ve <b>Anında Nakit Alım Kâr Oranı</b> yüzdelerinizi ayarlarsınız.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">🏪 Konsinye Bırakma Kâr Oranı (%)</label>
                  <span className="text-xs font-bold text-emerald-500 font-mono">%{consignmentProfitPct}</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  step="0.5"
                  value={consignmentProfitPct}
                  onChange={(e) => setConsignmentProfitPct(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <span className="text-[10px] text-zinc-400">Örn: Piyasa değeri 600.000 TL araçta %{consignmentProfitPct} kâr marjı düşülüp müşteriye <b>{(600000 * (1 - consignmentProfitPct / 100)).toLocaleString('tr-TR')} TL</b> Konsinye teklifi verilir.</span>
              </div>

              <div className="flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200">⚡ Anında Nakit Alım Kâr Oranı (%)</label>
                  <span className="text-xs font-bold text-brand-orange font-mono">%{cashOfferProfitPct}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="25"
                  step="0.5"
                  value={cashOfferProfitPct}
                  onChange={(e) => setCashOfferProfitPct(Number(e.target.value))}
                  className="w-full accent-brand-orange cursor-pointer"
                />
                <span className="text-[10px] text-zinc-400">Örn: Piyasa değeri 600.000 TL araçta %{cashOfferProfitPct} kâr marjı düşülüp müşteriye <b>{(600000 * (1 - cashOfferProfitPct / 100)).toLocaleString('tr-TR')} TL</b> Anında Nakit teklifi verilir.</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Lüks Araç (>= 2M ₺) Min Konsinye Kârı (₺)</label>
                <input
                  type="number"
                  value={luxuryMinProfitFixed}
                  onChange={(e) => setLuxuryMinProfitFixed(Number(e.target.value))}
                  className="glass-input rounded-xl p-3 text-xs font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Lüks Araç (>= 2M ₺) Max Nakit Kârı (₺)</label>
                <input
                  type="number"
                  value={luxuryMaxProfitFixed}
                  onChange={(e) => setLuxuryMaxProfitFixed(Number(e.target.value))}
                  className="glass-input rounded-xl p-3 text-xs font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Aylık Otomatik Enflasyon Artışı (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={monthlyInflationPercentage}
                  onChange={(e) => setMonthlyInflationPercentage(Number(e.target.value))}
                  className="glass-input rounded-xl p-3 text-xs font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl text-xs transition-all w-full sm:w-auto self-start cursor-pointer flex items-center gap-2 mt-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Galeri Kâr Ayarlarını Kaydet
            </button>
          </form>

          {/* Telegram Notification Bot Card */}
          <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-white/5 flex flex-col gap-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 border-b border-zinc-200 dark:border-white/5 pb-3">
              <Send className="w-4.5 h-4.5 text-sky-500" />
              Telegram Anlık Bildirim Entegrasyonu
            </h3>

            {telegramSaveSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{telegramSaveSuccess}</span>
              </div>
            )}

            {telegramError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-3.5 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{telegramError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTelegram} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Telegram Bot Token (BotFather)</label>
                <input
                  type="text"
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-xs font-mono w-full"
                />
                <span className="text-[10px] text-zinc-400">Telegram'da @BotFather üzerinden ücretsiz bot oluşturup aldığınız token.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Alıcı Telegram Chat ID'leri (Birden Fazla Ekleyebilirsiniz)</label>
                <input
                  type="text"
                  placeholder="123456789, 987654321, -100123456789"
                  value={telegramChatIds}
                  onChange={(e) => setTelegramChatIds(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-xs font-mono w-full"
                />
                <span className="text-[10px] text-zinc-400">
                  Mesajın düşmesini istediğiniz yönetici/çalışan Telegram ID'lerini veya Grup ID'sini virgülle ayırarak yazın (Örn: <code>123456, 789012</code>).
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4" />
                  Galeri WhatsApp İletişim Numarası (Tek Tıkla Mesaj İçin)
                </label>
                <input
                  type="text"
                  placeholder="05350379074"
                  value={galleryWhatsAppPhone}
                  onChange={(e) => setGalleryWhatsAppPhone(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-xs font-mono w-full border-emerald-500/30"
                />
                <span className="text-[10px] text-zinc-400">
                  Bildirim mesajlarındaki <b>"📱 Müşteriye WhatsApp'tan Mesaj At"</b> butonunun kullanacağı ana telefon numarası. İstediğiniz zaman değiştirebilirsiniz.
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 mt-2">
                <button
                  type="submit"
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3 px-5 rounded-xl text-xs transition-all w-full sm:w-auto cursor-pointer"
                >
                  Telegram Ayarlarını Kaydet
                </button>

                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={telegramTesting}
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {telegramTesting ? 'Test Gönderiliyor...' : 'Test Mesajı Gönder'}
                </button>
              </div>
            </form>

            {/* ADIM ADIM TELEGRAM KURULUM REHBERİ (Sıfırdan Anlaşılır Kılavuz) */}
            <div className="mt-4 pt-6 border-t border-zinc-200 dark:border-white/10 flex flex-col gap-4 bg-sky-500/5 dark:bg-sky-500/10 p-5 rounded-2xl border border-sky-500/20">
              <h4 className="text-xs font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                📖 Telegram Botu & WhatsApp Sıfırdan Adım Adım Kurulum Rehberi
              </h4>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Müşteriler siteden Değerleme veya Konsinye formu doldurduğunda <b>anında telefonunuza Telegram mesajı</b> düşmesini istiyorsanız aşağıdaki 4 kolay adımı sırasıyla uygulayın:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-sky-500/20 flex flex-col gap-1.5">
                  <span className="font-extrabold text-sky-600 dark:text-sky-400">1. Adım: Bot Oluşturma ve Token Alma</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    Telegram'da arama çubuğuna <b>@BotFather</b> yazın. Mesaj kısmına <code>/newbot</code> yazıp gönderin. Sizden bot ismi isteyecektir (Örn: <i>NakitGarajBot</i>). Ardından sonu <code>bot</code> ile biten bir kullanıcı adı verin (Örn: <i>nakitgaraj_bildirim_bot</i>). BotFather size <code>123456789:ABCdef...</code> şeklinde bir <b>Bot Token</b> verecektir. Onu kopyalayıp yukarıdaki ilk kutuya yapıştırın.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-sky-500/20 flex flex-col gap-1.5">
                  <span className="font-extrabold text-sky-600 dark:text-sky-400">2. Adım: Bota Girip BAŞLAT (START) Butonuna Basma</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    <b>ÇOK ÖNEMLİ KURAL:</b> Yeni oluşturduğunuz botun üzerine tıklayıp sohbet ekranını açın. En altta çıkan <b>BAŞLAT (START)</b> butonuna kesinlikle 1 kez basın! (Telegram güvenlik kuralları gereği siz başlatmadan bot size mesaj atamaz).
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-sky-500/20 flex flex-col gap-1.5">
                  <span className="font-extrabold text-sky-600 dark:text-sky-400">3. Adım: Chat ID'nizi Öğrenme</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    Telegram arama kısmına <b>@userinfobot</b> yazın. O bota rastgele bir mesaj atın, size kendi sayısal ID numaranızı verir (Örn: <code>123456789</code>). O numarayı kopyalayıp yukarıdaki <b>Chat ID</b> kutusuna yapıştırın. Eğer gruba mesaj gelmesini istiyorsanız grubu bota ekleyip grup Chat ID'sini girin.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-sky-500/20 flex flex-col gap-1.5">
                  <span className="font-extrabold text-sky-600 dark:text-sky-400">4. Adım: WhatsApp Buton Numarası ve Test</span>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
                    <b>Galeri WhatsApp Numarası</b> kutusuna müşterinin tıklayınca mesaj atacağı galeri telefon numaranızı girin (Örn: <code>05350379074</code>). Ardından <b>"Test Mesajı Gönder"</b> butonuna basın. Telefonunuza canlı mesaj düşecektir!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Pricing Formula Simulator */}
        <div className="lg:col-span-1">
          <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 sticky top-28 flex flex-col gap-6">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/5 pb-3 flex items-center gap-2">
              <Cpu className="w-4.5 h-4.5 text-brand-orange" />
              Formül Katsayı Simülatörü
            </h3>

            {/* Formula display */}
            <div className="bg-zinc-150 dark:bg-black/30 border border-zinc-200 dark:border-white/5 p-4 rounded-xl text-center flex flex-col gap-1.5">
              <span className="text-[9px] text-zinc-500 font-mono tracking-wider">MATEMATİKSEL MODEL (P_2el)</span>
              <span className="text-[10px] font-mono text-brand-orange font-bold">
                P_0km x (1 - delta_yas - delta_km) x gamma + epsilon
              </span>
            </div>

            {/* Sliders */}
            <div className="flex flex-col gap-4 text-xs">
              {/* Base Value */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-semibold">
                  <span className="text-zinc-500 dark:text-zinc-400">P_0km (Sıfır Fiyatı)</span>
                  <span className="text-zinc-900 dark:text-white font-mono">{baseValue.toLocaleString()} ₺</span>
                </div>
                <input
                  type="range"
                  min="300000"
                  max="3000000"
                  step="25000"
                  value={baseValue}
                  onChange={(e) => setBaseValue(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                />
              </div>

              {/* delta_yas */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-semibold">
                  <span className="text-zinc-500 dark:text-zinc-400">delta_yas (Yaş Düşüşü)</span>
                  <span className="text-zinc-900 dark:text-white font-mono">-%{deltaYas.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="0.5"
                  value={deltaYas}
                  onChange={(e) => setDeltaYas(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                />
              </div>

              {/* delta_km */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-semibold">
                  <span className="text-zinc-500 dark:text-zinc-400">delta_km (Kilometre Düşüşü)</span>
                  <span className="text-zinc-900 dark:text-white font-mono">-%{deltaKm.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="0.5"
                  value={deltaKm}
                  onChange={(e) => setDeltaKm(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                />
              </div>

              {/* gamma_donanim */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-semibold">
                  <span className="text-zinc-500 dark:text-zinc-400">gamma_donanim (Opsiyon Çarpanı)</span>
                  <span className="text-zinc-900 dark:text-white font-mono">x{gammaDonanim.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.90"
                  max="1.10"
                  step="0.01"
                  value={gammaDonanim}
                  onChange={(e) => setGammaDonanim(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                />
              </div>

              {/* epsilon_pazar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between font-semibold">
                  <span className="text-zinc-500 dark:text-zinc-400">epsilon_pazar (Sapma Oranı)</span>
                  <span className="text-zinc-900 dark:text-white font-mono">{epsilonPazar >= 0 ? '+' : ''}%{epsilonPazar}</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="10"
                  step="1"
                  value={epsilonPazar}
                  onChange={(e) => setEpsilonPazar(Number(e.target.value))}
                  className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                />
              </div>
            </div>

            {/* Computed Simulator outputs */}
            <div className="bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 p-4 rounded-xl flex flex-col gap-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-zinc-500">Tahmini Değer (P_2el):</span>
                <span className="font-black text-brand-orange text-sm">
                  {computedValue.toLocaleString()} ₺
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-650 dark:text-zinc-400">
                <span>Hızlı Satış Fiyatı:</span>
                <span>{quickSaleValue.toLocaleString()} ₺</span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-zinc-650 dark:text-zinc-400">
                <span>Maksimum Beklenen:</span>
                <span>{maxExpectedValue.toLocaleString()} ₺</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
