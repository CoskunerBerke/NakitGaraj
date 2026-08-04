'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Calendar, FileText, CheckCircle2, AlertCircle, Eye, X, Phone, User, Car, DollarSign, ShieldAlert, ChevronRight } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

const getBrandLogoUrl = (brandName: string) => {
  const b = (brandName || '').toLowerCase().trim();
  if (b.includes('audi')) return 'https://cdn.simpleicons.org/audi/F00000';
  if (b.includes('bmw')) return 'https://cdn.simpleicons.org/bmw/0066B1';
  if (b.includes('mercedes')) return 'https://cdn.simpleicons.org/mercedes/000000';
  if (b.includes('volkswagen') || b.includes('vw')) return 'https://cdn.simpleicons.org/volkswagen/001E50';
  if (b.includes('porsche')) return 'https://cdn.simpleicons.org/porsche/D5001C';
  if (b.includes('honda')) return 'https://cdn.simpleicons.org/honda/E60012';
  if (b.includes('toyota')) return 'https://cdn.simpleicons.org/toyota/EB0A1E';
  if (b.includes('nissan')) return 'https://cdn.simpleicons.org/nissan/C3002F';
  if (b.includes('ford')) return 'https://cdn.simpleicons.org/ford/003478';
  if (b.includes('peugeot')) return 'https://cdn.simpleicons.org/peugeot/000000';
  if (b.includes('renault')) return 'https://cdn.simpleicons.org/renault/DAA520';
  if (b.includes('citroen')) return 'https://cdn.simpleicons.org/citroen/D40028';
  if (b.includes('fiat')) return 'https://cdn.simpleicons.org/fiat/AD0D2A';
  if (b.includes('hyundai')) return 'https://cdn.simpleicons.org/hyundai/002C6C';
  if (b.includes('kia')) return 'https://cdn.simpleicons.org/kia/05141F';
  if (b.includes('volvo')) return 'https://cdn.simpleicons.org/volvo/003057';
  if (b.includes('tesla')) return 'https://cdn.simpleicons.org/tesla/E82127';
  if (b.includes('opel')) return 'https://cdn.simpleicons.org/opel/F7D000';
  if (b.includes('dacia')) return 'https://cdn.simpleicons.org/dacia/0055A5';
  if (b.includes('seat')) return 'https://cdn.simpleicons.org/seat/D6001C';
  if (b.includes('cupra')) return 'https://cdn.simpleicons.org/cupra/000000';
  if (b.includes('alfa')) return 'https://cdn.simpleicons.org/alfaromeo/981E32';
  if (b.includes('land')) return 'https://cdn.simpleicons.org/landrover/005A2B';
  if (b.includes('jeep')) return 'https://cdn.simpleicons.org/jeep/FF6600';
  if (b.includes('suzuki')) return 'https://cdn.simpleicons.org/suzuki/E60012';
  if (b.includes('mazda')) return 'https://cdn.simpleicons.org/mazda/101010';
  if (b.includes('subaru')) return 'https://cdn.simpleicons.org/subaru/013369';
  if (b.includes('chevrolet')) return 'https://cdn.simpleicons.org/chevrolet/CD9B1D';
  return null;
};

export default function ValuationsList() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEval, setSelectedEval] = useState<any>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchEvaluations = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/evaluations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Değerleme geçmişi yüklenemedi.');
      const data = await res.json();
      setEvaluations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvaluations();
    const interval = setInterval(fetchEvaluations, 3000); // 3s live refresh
    return () => clearInterval(interval);
  }, []);

  const filteredEvaluations = evaluations.filter((item) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    const brand = item.vehicleSpecification?.manufacturer?.name?.toLowerCase() || '';
    const model = item.vehicleSpecification?.model?.name?.toLowerCase() || '';
    const plate = (item.licensePlate || '').toLowerCase();
    const phone = (item.phone || '').toLowerCase();
    const name = `${item.firstName || ''} ${item.lastName || ''}`.toLowerCase();
    return brand.includes(query) || model.includes(query) || plate.includes(query) || phone.includes(query) || name.includes(query);
  });

  if (isLoading) {
    return <div className="text-zinc-500 dark:text-zinc-400 py-12 text-center">Değerleme sorguları yükleniyor...</div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto">
      {/* Header & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-white/10 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-brand-orange" />
            Değerleme Sorguları
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Yapay zeka motoru üzerinden yapılan tüm araç değerlemeleri ve müşteri teklif detayları.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Plaka, Marka, Model veya Müşteri Ara..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="glass-input rounded-xl px-4 py-2.5 text-xs w-64"
          />

          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Canlı Yayın (3s)</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-4 rounded-xl flex items-start gap-2">
          <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Table Container */}
      <div className="glass-card rounded-3xl border border-zinc-200 dark:border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/10 bg-zinc-50/80 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] font-bold">
                <th className="py-4 px-6">Marka & Model</th>
                <th className="py-4 px-6">Plaka & Durum</th>
                <th className="py-4 px-6">Müşteri</th>
                <th className="py-4 px-6">Kilometre & Renk</th>
                <th className="py-4 px-6">Müşteri Talebi</th>
                <th className="py-4 px-6 text-right">Anında Nakit Alım Teklifi</th>
                <th className="py-4 px-6 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5 text-zinc-800 dark:text-zinc-200">
              {filteredEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-400 text-xs">
                    Henüz sorgulanmış araç bulunmuyor veya aramanıza uygun sonuç bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredEvaluations.map((item) => {
                  const mfgName = item.vehicleSpecification?.manufacturer?.name || 'Araç';
                  const modelName = item.vehicleSpecification?.model?.name || '';
                  const year = item.vehicleSpecification?.year || '';
                  const logoUrl = getBrandLogoUrl(mfgName);
                  const isDamaged = item.damageStatus && item.damageStatus !== 'NO' && item.damageStatus !== 'UNKNOWN';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedEval(item)}
                      className="hover:bg-brand-orange/5 dark:hover:bg-white/5 transition-all cursor-pointer group"
                    >
                      {/* Marka & Model */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 shrink-0 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-2 flex items-center justify-center">
                            {logoUrl ? (
                              <img
                                src={logoUrl}
                                alt={mfgName}
                                className="w-full h-full object-contain filter dark:invert-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Car className="w-5 h-5 text-brand-orange" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-zinc-900 dark:text-white group-hover:text-brand-orange transition-colors">
                              {mfgName} {modelName}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              Model Yılı: {year} | {item.vehicleSpecification?.fuelType?.name || ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Plaka & Durum */}
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-extrabold uppercase font-mono px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white text-xs tracking-wider">
                            {item.licensePlate || '34ABC123'}
                          </span>
                          <span
                            className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase ${
                              isDamaged
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isDamaged ? 'Hasarlı' : 'Hatasız / Orijinal'}
                          </span>
                        </div>
                      </td>

                      {/* Müşteri Bilgileri */}
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-900 dark:text-white">
                            {item.firstName || 'İsimsiz'} {item.lastName || ''}
                          </span>
                          <span className="text-[11px] text-zinc-500 font-mono">
                            {item.phone ? `📞 ${item.phone}` : 'Telefon Girilmedi'}
                          </span>
                        </div>
                      </td>

                      {/* KM & Renk */}
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-800 dark:text-zinc-200">
                            {item.mileage ? `${item.mileage.toLocaleString('tr-TR')} km` : '-'}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            Renk: {item.color || 'Belirtilmedi'}
                          </span>
                        </div>
                      </td>

                      {/* Müşteri Talebi */}
                      <td className="py-4 px-6">
                        {item.userDesiredPrice && item.userDesiredPrice >= 200000 ? (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                            {item.userDesiredPrice.toLocaleString('tr-TR')} ₺
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">Belirtilmedi</span>
                        )}
                      </td>

                      {/* Anında Nakit Alım Teklifi */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-black text-brand-orange text-sm md:text-base">
                            {(item.finalOfferedPrice || item.estimatedValue).toLocaleString('tr-TR')} ₺
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            Konsinye: {(item.maxExpectedValue || item.estimatedValue).toLocaleString('tr-TR')} ₺
                          </span>
                        </div>
                      </td>

                      {/* İşlem */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEval(item);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-orange/10 hover:bg-brand-orange text-brand-orange hover:text-white border border-brand-orange/20 font-bold text-xs transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          İncele
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Modal Drawer */}
      {selectedEval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-card max-w-2xl w-full p-6 md:p-8 border border-zinc-200 dark:border-white/10 rounded-3xl flex flex-col gap-6 relative bg-white dark:bg-zinc-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 shrink-0 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 p-2 flex items-center justify-center">
                  {getBrandLogoUrl(selectedEval.vehicleSpecification?.manufacturer?.name || '') ? (
                    <img
                      src={getBrandLogoUrl(selectedEval.vehicleSpecification?.manufacturer?.name || '')!}
                      alt={selectedEval.vehicleSpecification?.manufacturer?.name || ''}
                      className="w-full h-full object-contain filter dark:invert-0"
                    />
                  ) : (
                    <Car className="w-5 h-5 text-brand-orange" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                    {selectedEval.vehicleSpecification?.manufacturer?.name} {selectedEval.vehicleSpecification?.model?.name} ({selectedEval.vehicleSpecification?.year})
                  </h3>
                  <span className="text-xs font-mono text-brand-orange font-bold uppercase">
                    Plaka: {selectedEval.licensePlate || '34ABC123'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedEval(null)}
                className="p-2 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Customer Info */}
              <div className="bg-zinc-50 dark:bg-white/3 p-4 rounded-2xl border border-zinc-200 dark:border-white/5 flex flex-col gap-2">
                <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Müşteri İletişim Bilgileri</span>
                <span className="font-black text-sm text-zinc-900 dark:text-white">
                  👤 {selectedEval.firstName} {selectedEval.lastName}
                </span>
                <span className="font-mono font-bold text-brand-orange">
                  📞 {selectedEval.phone || 'Girilmedi'}
                </span>
                {selectedEval.phone && (
                  <a
                    href={`https://wa.me/${selectedEval.phone.replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(`Merhaba ${selectedEval.firstName || ''} Bey/Hanım, NakitGaraj üzerinden ${selectedEval.vehicleSpecification?.manufacturer?.name || ''} ${selectedEval.vehicleSpecification?.model?.name || ''} aracınız için yaptığınız değerleme ile ilgili yazıyorum.`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-all mt-1 w-fit cursor-pointer"
                  >
                    📱 WhatsApp ile Müşteriye Yaz
                  </a>
                )}
                <span className="text-[10px] text-zinc-500 mt-1">
                  ⏱️ Satış Aciliyeti: {selectedEval.sellingTimeline === 'hemen' ? 'Hemen Satmak İstiyor' : selectedEval.sellingTimeline || 'Belirtilmedi'}
                </span>
              </div>

              {/* Price Offers */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex flex-col gap-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[10px]">Pazarlık & Galeri Teklifleri</span>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">Müşteri Talebi:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">
                    {selectedEval.userDesiredPrice ? `${selectedEval.userDesiredPrice.toLocaleString('tr-TR')} ₺` : 'Belirtilmedi'}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-emerald-500/20 pt-1.5">
                  <span className="font-bold text-emerald-800 dark:text-emerald-200">Anında Nakit Alım Teklifimiz:</span>
                  <span className="font-black text-brand-orange text-sm">
                    {(selectedEval.finalOfferedPrice || selectedEval.estimatedValue).toLocaleString('tr-TR')} ₺
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-600 dark:text-zinc-400">Dükkan Konsinye Fiyatı:</span>
                  <span className="font-bold text-zinc-800 dark:text-white">
                    {(selectedEval.maxExpectedValue || selectedEval.estimatedValue).toLocaleString('tr-TR')} ₺
                  </span>
                </div>
              </div>
            </div>

            {/* Specs & Damage */}
            <div className="bg-zinc-50 dark:bg-white/3 p-4 rounded-2xl border border-zinc-200 dark:border-white/5 flex flex-col gap-2 text-xs">
              <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Araç Özellikleri & Hasar Durumu</span>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-zinc-700 dark:text-zinc-300">
                <div>Kilometre: <strong>{selectedEval.mileage.toLocaleString('tr-TR')} km</strong></div>
                <div>Renk: <strong>{selectedEval.color}</strong></div>
                <div>Hasar: <strong>{selectedEval.damageStatus === 'NO' ? 'Hatasız' : 'Hasarlı'}</strong></div>
                <div>Motor: <strong>{selectedEval.vehicleSpecification?.variant?.name}</strong></div>
                <div>Şanzıman: <strong>{selectedEval.vehicleSpecification?.transmissionType?.name}</strong></div>
                <div>Yakıt: <strong>{selectedEval.vehicleSpecification?.fuelType?.name}</strong></div>
              </div>
            </div>

            {/* AI Analysis */}
            {selectedEval.aiAnalysis && selectedEval.aiAnalysis.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Yapay Zeka Analiz Notları</span>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {selectedEval.aiAnalysis.map((note: string, idx: number) => (
                    <div key={idx} className="bg-zinc-100/50 dark:bg-white/5 p-3 rounded-xl border border-zinc-200 dark:border-white/5 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                      <span>{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
