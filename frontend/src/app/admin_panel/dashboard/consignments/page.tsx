'use client';

import React, { useEffect, useState } from 'react';
import { UserCheck, MessageSquare, MapPin, PhoneCall, Mail, Clock, ShieldAlert, AlertCircle } from 'lucide-react';
import RealisticCarDamageSchematic from '../../../../components/RealisticCarDamageSchematic';

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

// Helper for car SVG paint parts color matching Image 4
const getPartColor = (status: string) => {
  switch (status) {
    case 'DEGISEN': return 'fill-red-500 stroke-red-600';
    case 'BOYALI': return 'fill-blue-500 stroke-blue-600';     // Boyalı: Blue
    case 'LOKAL': return 'fill-amber-500 stroke-amber-600';    // Lokal Boyalı: Orange (Amber)
    default: return 'fill-zinc-200 dark:fill-zinc-800/40 stroke-zinc-300 dark:stroke-zinc-700';
  }
};

// Helper for letter labels inside parts (D: Degisen, B: Boyali, L: Lokal)
const getPartLabel = (status: string) => {
  switch (status) {
    case 'DEGISEN': return 'D';
    case 'BOYALI': return 'B';
    case 'LOKAL': return 'L';
    default: return '';
  }
};

// Safely extract manager notes without showing the raw appraisal JSON
const getManagerNotes = (notes: string) => {
  if (!notes) return '';
  try {
    const parsed = JSON.parse(notes);
    if (parsed.paintScheme || parsed.chassisState || parsed.equipmentsObj || parsed.vehicleStatusObj) {
      return ''; // Appraisal JSON
    }
  } catch (e) {
    // Plain text notes
  }
  return notes;
};

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  PENDING: {
    label: 'Müşteri Aranacak (Bekliyor)',
    style: 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20',
  },
  ARANDI_ACMEDI: {
    label: 'Arandı, Açmadı',
    style: 'bg-red-550/10 text-red-600 dark:text-red-500 border border-red-550/20',
  },
  ARANDI_GERI_DONECEK: {
    label: 'Arandı, Geri Dönecek',
    style: 'bg-purple-500/10 text-purple-600 dark:text-purple-500 border border-purple-500/20',
  },
  ARANDI_TEKLIFI_BEGENMEDI: {
    label: 'Arandı, Teklifi Beğenmedi',
    style: 'bg-rose-500/10 text-rose-600 dark:text-rose-500 border border-rose-500/20',
  },
  ARANDI_KONSINYEYE_BIRAKACAK: {
    label: 'Arandı, Konsiyeye Bırakacak',
    style: 'bg-indigo-550/10 text-indigo-600 dark:text-indigo-500 border border-indigo-550/20',
  },
  ARANDI_GERI_ARAYACAK: {
    label: 'Arandı, Geri Arayacağını Söyledi',
    style: 'bg-cyan-550/10 text-cyan-600 dark:text-cyan-500 border border-cyan-550/20',
  },
  APPROVED: {
    label: 'Otoparka Davet Edildi (Onaylandı)',
    style: 'bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-500/20',
  },
  REJECTED: {
    label: 'Reddedildi / İptal',
    style: 'bg-zinc-500/10 text-zinc-650 dark:text-zinc-400 border border-zinc-500/20',
  },
  COMPLETED: {
    label: 'Satış Tamamlandı',
    style: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/20',
  },
};

export default function ConsignmentsCRM() {
  const [consignments, setConsignments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCons, setSelectedCons] = useState<any>(null);

  // Status updating form states
  const [statusVal, setStatusVal] = useState('PENDING');
  const [notesVal, setNotesVal] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchConsignments = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/consignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Konsinye listesi yüklenemedi.');
      const data = await res.json();
      setConsignments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConsignments();
    const interval = setInterval(fetchConsignments, 3000); // 3-second live auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Handle URL parameters to auto-select a specific consignment
  useEffect(() => {
    if (consignments.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('id');
      if (urlId) {
        const found = consignments.find((c) => c.id === urlId);
        if (found) {
          setSelectedCons(found);
          setStatusVal(found.status);
          setNotesVal(getManagerNotes(found.notes));
        }
      }
    }
  }, [consignments]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCons) return;

    setIsUpdating(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/consignments/${selectedCons.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: statusVal, notes: notesVal }),
      });

      if (!res.ok) throw new Error('Durum güncellenirken hata oluştu.');

      // Refresh list and update the active selected consignment inline for live feedback
      const freshRes = await fetch(`${API_BASE}/admin/consignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (freshRes.ok) {
        const data = await freshRes.json();
        setConsignments(data);
        const updatedRecord = data.find((c: any) => c.id === selectedCons.id);
        if (updatedRecord) {
          setSelectedCons(updatedRecord);
          setStatusVal(updatedRecord.status);
          setNotesVal(getManagerNotes(updatedRecord.notes));
        }
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };  if (isLoading) {
    return <div className="text-zinc-500 dark:text-zinc-400 py-10 text-center">Konsinye başvuruları yükleniyor...</div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">Konsinye Başvuruları (CRM)</h2>
        <p className="text-xs text-zinc-500 mt-1">İletişime geçilmeyi bekleyen ve satıştaki araç sahipleri.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-4 rounded-xl flex items-start gap-2 max-w-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Consignments List Table */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {consignments.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 text-center text-zinc-500 text-xs border border-zinc-200 dark:border-white/5">
              Henüz konsinye başvurusu bulunmuyor.
            </div>
          ) : (
            consignments.map((cons) => (
              <div
                key={cons.id}
                onClick={() => {
                  setSelectedCons(cons);
                  setStatusVal(cons.status);
                  setNotesVal(getManagerNotes(cons.notes));
                }}
                className={`glass-card rounded-2xl p-5 border border-zinc-200 dark:border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:border-brand-orange/30 transition-all ${
                  selectedCons?.id === cons.id ? 'border-brand-orange bg-brand-orange/5' : ''
                }`}
              >
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white text-sm">
                      {cons.firstName} {cons.lastName}
                    </span>
                    <span
                      className={`text-[8px] font-bold px-2 py-0.5 rounded-full inline-block ${
                        STATUS_MAP[cons.status]?.style || STATUS_MAP.PENDING.style
                      }`}
                    >
                      {STATUS_MAP[cons.status]?.label || cons.status}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono mt-0.5">{cons.phone}</span>
                  {cons.vehicleEvaluation && (
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                      Araç: {cons.vehicleEvaluation.vehicleSpecification.manufacturer.name}{' '}
                      {cons.vehicleEvaluation.vehicleSpecification.model.name} ({cons.vehicleEvaluation.vehicleSpecification.year})
                    </span>
                  )}
                </div>

                <div className="text-right flex flex-col gap-1 justify-end items-end text-xs shrink-0">
                  <span className="text-zinc-650 dark:text-zinc-400 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                    {cons.province} / {cons.district}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-650 mt-1 font-mono">
                    {new Date(cons.createdAt).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Details and Update side panel */}
        <div className="lg:col-span-1">
          {selectedCons ? (
            <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 sticky top-28 flex flex-col gap-6">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/5 pb-3 flex items-center gap-2">
                <UserCheck className="w-4.5 h-4.5 text-brand-orange" />
                Başvuru Detayı
              </h3>

              <div className="flex flex-col gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block">Başvuran Müşteri</span>
                  <span className="text-zinc-900 dark:text-white font-bold text-sm mt-0.5 block">
                    {selectedCons.firstName} {selectedCons.lastName}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-500 block">İrtibat Bilgileri</span>
                  <div className="flex flex-col gap-1 mt-1 text-zinc-700 dark:text-zinc-300">
                    <a href={`tel:${selectedCons.phone}`} className="flex items-center gap-1.5 hover:text-brand-orange">
                      <PhoneCall className="w-3.5 h-3.5 text-zinc-400" />
                      {selectedCons.phone}
                    </a>
                    <a href={`mailto:${selectedCons.email}`} className="flex items-center gap-1.5 hover:text-brand-orange mt-1">
                      <Mail className="w-3.5 h-3.5 text-zinc-400" />
                      {selectedCons.email}
                    </a>
                    {selectedCons.phone && (
                      <a
                        href={`https://wa.me/${selectedCons.phone.replace(/\D/g, '').replace(/^0/, '90')}?text=${encodeURIComponent(`Merhaba ${selectedCons.firstName || ''} Bey/Hanım, NakitGaraj üzerinden yaptığınız dükkana bırakma (konsinye) başvurusu ile ilgili yazıyorum.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-all mt-2 w-fit cursor-pointer"
                      >
                        📱 WhatsApp ile Müşteriye Yaz
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-zinc-500 block">Konum ve İletişim Tercihi</span>
                  <span className="text-zinc-700 dark:text-zinc-300 font-semibold block mt-0.5">
                    {selectedCons.province} / {selectedCons.district} | Kanal: {selectedCons.preferredContact}
                  </span>
                </div>

                {selectedCons.vehicleEvaluation && (
                  <div className="bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 p-4 rounded-xl flex flex-col gap-2">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Araç Bilgisi</span>
                    <span className="font-bold text-zinc-800 dark:text-white">
                      {selectedCons.vehicleEvaluation.vehicleSpecification.manufacturer.name}{' '}
                      {selectedCons.vehicleEvaluation.vehicleSpecification.model.name} ({selectedCons.vehicleEvaluation.vehicleSpecification.year})
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      Plaka: <span className="text-zinc-800 dark:text-zinc-300 font-mono font-bold uppercase">{selectedCons.vehicleEvaluation.licensePlate}</span> |{' '}
                      KM: {selectedCons.vehicleEvaluation.mileage.toLocaleString()} | Hasar: {selectedCons.vehicleEvaluation.damageStatus}
                    </span>
                    
                    {/* Render Detailed Appraisal Summary if available */}
                    {(() => {
                      let paint: Record<string, string> = {};
                      let chassis: Record<string, boolean> = {};
                      let equip: any = {};
                      let mech: any = {};

                      // 1. Try to parse from vehicleEvaluation (permanent DB fields)
                      if (selectedCons.vehicleEvaluation) {
                        try {
                          paint = JSON.parse(selectedCons.vehicleEvaluation.paintScheme || '{}');
                          chassis = JSON.parse(selectedCons.vehicleEvaluation.chassisState || '{}');
                          equip = JSON.parse(selectedCons.vehicleEvaluation.equipments || '{}');
                          mech = JSON.parse(selectedCons.vehicleEvaluation.vehicleStatus || '{}');
                        } catch (e) {}
                      }

                      // 2. Fallback to notes if empty (for backward compatibility)
                      if (Object.keys(paint).length === 0 && selectedCons.notes) {
                        try {
                          const parsed = JSON.parse(selectedCons.notes);
                          if (parsed.paintScheme || parsed.chassisState || parsed.equipmentsObj || parsed.vehicleStatusObj) {
                            paint = parsed.paintScheme || {};
                            chassis = parsed.chassisState || {};
                            equip = parsed.equipmentsObj || {};
                            mech = parsed.vehicleStatusObj || {};
                          }
                        } catch (e) {}
                      }

                      const changes = Object.entries(paint).filter(([_, v]) => v === 'DEGISEN').map(([k]) => k);
                      const paints = Object.entries(paint).filter(([_, v]) => v === 'BOYALI').map(([k]) => k);
                      const locals = Object.entries(paint).filter(([_, v]) => v === 'LOKAL').map(([k]) => k);
                      const chassisIssues = Object.entries(chassis).filter(([_, v]) => v === true).map(([k]) => k);

                      const hasAnyAppraisal = Object.keys(paint).length > 0 || chassisIssues.length > 0;

                      if (!hasAnyAppraisal) return null;

                      return (
                        <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-white/5 flex flex-col gap-3.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
                          {/* Ekspertiz Şeması */}
                          <span className="font-bold text-[9px] uppercase tracking-wider text-brand-orange block">Boyalı veya Değişen Parça Şeması</span>
                          
                          <div className="flex flex-col items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                            <svg className="w-32 h-64" viewBox="0 0 200 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                              {/* Tavan (Roof) */}
                              <rect x="60" y="140" width="80" height="100" rx="8" className={`${getPartColor(paint['Tavan'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Tavan']) && (
                                <text x="100" y="190" fill="white" fontSize="12" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Tavan'])}</text>
                              )}
                              
                              {/* Motor Kaputu (Hood) */}
                              <path d="M60 80C60 60 70 40 100 40C130 40 140 60 140 80V130H60V80Z" className={`${getPartColor(paint['Motor Kaputu'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Motor Kaputu']) && (
                                <text x="100" y="85" fill="white" fontSize="12" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Motor Kaputu'])}</text>
                              )}
                              
                              {/* Ön Tampon */}
                              <rect x="70" y="20" width="60" height="15" rx="4" className={`${getPartColor(paint['Ön Tampon'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Ön Tampon']) && (
                                <text x="100" y="28" fill="white" fontSize="9" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Ön Tampon'])}</text>
                              )}
                              
                              {/* Bagaj (Trunk) */}
                              <path d="M60 250H140V300C140 320 130 330 100 330C70 330 60 320 60 300V250Z" className={`${getPartColor(paint['Bagaj'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Bagaj']) && (
                                <text x="100" y="290" fill="white" fontSize="12" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Bagaj'])}</text>
                              )}
                              
                              {/* Arka Tampon */}
                              <rect x="70" y="340" width="60" height="15" rx="4" className={`${getPartColor(paint['Arka Tampon'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Arka Tampon']) && (
                                <text x="100" y="348" fill="white" fontSize="9" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Arka Tampon'])}</text>
                              )}
                              
                              {/* Sol Ön Çamurluk */}
                              <path d="M35 50C35 50 45 50 50 60V110H35V50Z" className={`${getPartColor(paint['Sol Ön Çamurluk'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sol Ön Çamurluk']) && (
                                <text x="42" y="80" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sol Ön Çamurluk'])}</text>
                              )}
                              {/* Sağ Ön Çamurluk */}
                              <path d="M165 50C165 50 155 50 150 60V110H165V50Z" className={`${getPartColor(paint['Sağ Ön Çamurluk'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sağ Ön Çamurluk']) && (
                                <text x="158" y="80" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sağ Ön Çamurluk'])}</text>
                              )}

                              {/* Sol Ön Kapı */}
                              <rect x="35" y="120" width="18" height="50" rx="3" className={`${getPartColor(paint['Sol Ön Kapı'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sol Ön Kapı']) && (
                                <text x="44" y="145" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sol Ön Kapı'])}</text>
                              )}
                              {/* Sağ Ön Kapı */}
                              <rect x="147" y="120" width="18" height="50" rx="3" className={`${getPartColor(paint['Sağ Ön Kapı'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sağ Ön Kapı']) && (
                                <text x="156" y="145" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sağ Ön Kapı'])}</text>
                              )}

                              {/* Sol Arka Kapı */}
                              <rect x="35" y="180" width="18" height="50" rx="3" className={`${getPartColor(paint['Sol Arka Kapı'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sol Arka Kapı']) && (
                                <text x="44" y="205" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sol Arka Kapı'])}</text>
                              )}
                              {/* Sağ Arka Kapı */}
                              <rect x="147" y="180" width="18" height="50" rx="3" className={`${getPartColor(paint['Sağ Arka Kapı'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sağ Arka Kapı']) && (
                                <text x="156" y="205" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sağ Arka Kapı'])}</text>
                              )}

                              {/* Sol Arka Çamurluk */}
                              <path d="M35 240H50V290C45 300 35 300 35 300V240Z" className={`${getPartColor(paint['Sol Arka Çamurluk'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sol Arka Çamurluk']) && (
                                <text x="42" y="270" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sol Arka Çamurluk'])}</text>
                              )}
                              {/* Sağ Arka Çamurluk */}
                              <path d="M165 240H150V290C155 300 165 300 165 300V240Z" className={`${getPartColor(paint['Sağ Arka Çamurluk'] || 'ORIJINAL')} transition-all`} strokeWidth="1.5" />
                              {getPartLabel(paint['Sağ Arka Çamurluk']) && (
                                <text x="158" y="270" fill="white" fontSize="10" fontWeight="black" textAnchor="middle" dy=".3em">{getPartLabel(paint['Sağ Arka Çamurluk'])}</text>
                              )}
                            </svg>

                            {/* Color Legend Row matching image legend */}
                            <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 mt-3 text-[9px] font-black tracking-wide border-t border-zinc-200 dark:border-zinc-800 pt-2 w-full">
                              <div className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-200 dark:bg-zinc-700" /> Orijinal</div>
                              <div className="flex items-center gap-1 text-amber-500"><span className="w-2 h-2 rounded bg-amber-500" /> Lokal (L)</div>
                              <div className="flex items-center gap-1 text-blue-500"><span className="w-2 h-2 rounded bg-blue-500" /> Boyalı (B)</div>
                              <div className="flex items-center gap-1 text-red-500"><span className="w-2 h-2 rounded bg-red-500" /> Değişen (D)</div>
                            </div>
                          </div>

                          {/* Text-based summary list */}
                          <div className="bg-zinc-100/50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl flex flex-col gap-1.5 mt-0.5">
                            {changes.length > 0 && <div><span className="font-bold text-red-500">Değişen Parçalar:</span> <span className="font-semibold text-zinc-700 dark:text-zinc-300">{changes.join(', ')}</span></div>}
                            {paints.length > 0 && <div><span className="font-bold text-blue-500">Boyalı Parçalar:</span> <span className="font-semibold text-zinc-700 dark:text-zinc-300">{paints.join(', ')}</span></div>}
                            {locals.length > 0 && <div><span className="font-bold text-amber-500">Lokal Boyalı Parçalar:</span> <span className="font-semibold text-zinc-700 dark:text-zinc-300">{locals.join(', ')}</span></div>}
                            {changes.length === 0 && paints.length === 0 && locals.length === 0 && <div className="text-emerald-500 font-bold">✓ Tamamen Orijinal (Boya / Hasarsız)</div>}

                            {chassisIssues.length > 0 ? (
                              <div className="text-red-500 font-bold mt-1.5">⚠️ Şasi İşlemi: {chassisIssues.join(', ')}</div>
                            ) : (
                              <div className="text-emerald-500 font-medium mt-1.5">✓ Şasiler Tamamen İşlemsiz</div>
                            )}
                          </div>

                          <span className="font-bold text-[9px] uppercase tracking-wider text-brand-orange block mt-1">Donanım & Mekanik Özellikler</span>
                          <div className="flex flex-wrap gap-1.5">
                            {equip.sunroof && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Sunroof</span>}
                            {equip.panoramikTavan && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Panoramik Tavan</span>}
                            {equip.camTavan && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Cam Tavan</span>}
                            <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">{mech.drivetrain || 'Önden Çekiş'}</span>
                            {mech.heavyDamage && <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 rounded-lg text-[9px] font-black">Ağır Hasar Kaydı (Pert)</span>}
                            {mech.crackedGlass && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Camda Kırık</span>}
                            {mech.scratchOrDent && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Ezik/Çizik</span>}
                            {mech.hasExpertReport && <span className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1 rounded-lg text-[9px] font-bold text-zinc-700 dark:text-zinc-300">Ekspertiz Raporlu</span>}
                          </div>
                          
                          {equip.otherFeatures && (
                            <div className="text-[10px] italic text-zinc-400 dark:text-zinc-500 bg-zinc-50/50 dark:bg-white/2 p-2 rounded-lg border border-zinc-100 dark:border-white/5">
                              Ekstra Donanımlar: {equip.otherFeatures}
                            </div>
                          )}
                          
                          {mech.videoLink && (
                            <a href={mech.videoLink} target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:underline font-bold text-[10px] mt-0.5 block">
                              Araç Videosunu İzle ➔
                            </a>
                          )}
                        </div>
                      );
                    })()}

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-zinc-200 dark:border-white/5">
                      <span className="text-[10px] text-zinc-500">Hesaplanan Değer:</span>
                      <span className="font-extrabold text-brand-orange">
                        {selectedCons.vehicleEvaluation.estimatedValue.toLocaleString()} ₺
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Update Form */}
              <form onSubmit={handleUpdateStatus} className="border-t border-zinc-200 dark:border-white/5 pt-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Başvuru Durumu</label>
                  <select
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value)}
                    className="glass-input rounded-xl p-3 text-xs w-full bg-white dark:bg-zinc-950 text-zinc-800 dark:text-white"
                  >
                    {Object.entries(STATUS_MAP).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Yönetici Notları</label>
                  <textarea
                    rows={3}
                    value={notesVal}
                    onChange={(e) => setNotesVal(e.target.value)}
                    placeholder="Müşteri görüşmesi, otopark randevusu veya satış detaylarını buraya not edin..."
                    className="glass-input rounded-xl p-3 text-xs w-full resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdating}
                  className="bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs transition-all w-full mt-2 cursor-pointer"
                >
                  {isUpdating ? 'Güncelleniyor...' : 'Durumu Güncelle'}
                </button>
              </form>
            </div>
          ) : (
            <div className="glass-card rounded-3xl p-8 border border-zinc-200 dark:border-white/5 text-center text-zinc-500 text-xs py-20">
              Detayları görüntülemek ve durum güncellemek için soldan bir başvuru seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
