'use client';

import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  UserCheck,
  Percent,
  Clock,
  TrendingUp,
  MapPin,
  Calendar,
  AlertCircle,
  Database,
} from 'lucide-react';
import Link from 'next/link';

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

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function DashboardOverview() {
  const [statsData, setStatsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const res = await fetch(`${API_BASE}/admin/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('İstatistikler yüklenirken bir hata oluştu.');
        }

        const data = await res.json();
        setStatsData(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000); // 3-second live auto-refresh
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Yönetim Genel Bakış</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="shimmer-loader rounded-2xl h-28 border border-zinc-200 dark:border-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
          <div className="shimmer-loader rounded-3xl h-96 border border-zinc-200 dark:border-white/5" />
          <div className="shimmer-loader rounded-3xl h-96 border border-zinc-200 dark:border-white/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-5 rounded-2xl flex items-start gap-3 max-w-xl">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">Hata Oluştu</h4>
          <p className="mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const { stats, recentConsignments, recentEvaluations } = statsData;

  const cardItems = [
    {
      title: 'Toplam Değerleme',
      value: stats.totalEvaluations,
      desc: 'Sistemde yapılan toplam analiz',
      icon: Sparkles,
      color: 'text-brand-orange bg-brand-orange/10 border-brand-orange/20',
    },
    {
      title: 'Konsinye Başvuruları',
      value: stats.totalConsignments,
      desc: `Bekleyen: ${stats.pendingConsignments} başvuru`,
      icon: UserCheck,
      color: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-400/10 border-emerald-500/20 dark:border-emerald-400/20',
    },
    {
      title: 'Ortalama Araç Değeri',
      value: `${stats.avgValuation.toLocaleString('tr-TR')} ₺`,
      desc: 'Analiz edilen ortalama araç değeri',
      icon: TrendingUp,
      color: 'text-blue-500 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-400/10 border-blue-500/20 dark:border-blue-400/20',
    },
    {
      title: 'Veri Tabanı Boyutu',
      value: stats.database.specifications,
      desc: `${stats.database.brands} Marka, ${stats.database.models} Model`,
      icon: Database,
      color: 'text-purple-500 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-400/10 border-purple-500/20 dark:border-purple-400/20',
    },
  ];

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Title */}
      <div>
        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">Yönetim Genel Bakış</h2>
        <p className="text-xs text-zinc-500 mt-1">Platform genel performansı ve pazar hareketleri.</p>
      </div>

      {/* Grid Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cardItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 border border-zinc-200 dark:border-white/5 flex items-center justify-between gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-zinc-500 font-medium">{item.title}</span>
                <span className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">{item.value}</span>
                <span className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</span>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${item.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent submissions layout grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Consignments CRM logs */}
        <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Son Konsinye Başvuruları</h3>
              <Link
                href="/admin_panel/dashboard/consignments"
                className="text-[11px] text-brand-orange hover:underline font-semibold"
              >
                Tümünü Gör
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              {recentConsignments.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-10">Henüz başvuru bulunmuyor.</p>
              ) : (
                recentConsignments.map((cons: any) => (
                  <Link
                    key={cons.id}
                    href={`/admin_panel/dashboard/consignments?id=${cons.id}`}
                    className="bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 rounded-xl p-4 flex justify-between items-center gap-4 text-xs hover:border-brand-orange/30 transition-all cursor-pointer block"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-zinc-800 dark:text-white">
                        {cons.firstName} {cons.lastName}
                      </span>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">{cons.phone}</span>
                      {cons.vehicleEvaluation && (
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-450 mt-1">
                          Araç:{' '}
                          {cons.vehicleEvaluation.vehicleSpecification.manufacturer.name}{' '}
                          {cons.vehicleEvaluation.vehicleSpecification.model.name}
                        </span>
                      )}
                    </div>

                    <div className="text-right flex flex-col gap-1.5">
                      <span className="text-zinc-500 text-[10px] flex items-center gap-1 justify-end">
                        <MapPin className="w-3 h-3 text-zinc-400" />
                        {cons.province}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full inline-block ${
                          STATUS_MAP[cons.status]?.style || STATUS_MAP.PENDING.style
                        }`}
                      >
                        {STATUS_MAP[cons.status]?.label || cons.status}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Valuations list */}
        <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Son Değerleme Sorguları</h3>
              <Link
                href="/admin_panel/dashboard/valuations"
                className="text-[11px] text-brand-orange hover:underline font-semibold"
              >
                Tümünü Gör
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              {recentEvaluations.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-10">Henüz değerleme sorgulanmadı.</p>
              ) : (
                recentEvaluations.map((evalItem: any) => (
                  <div
                    key={evalItem.id}
                    className="bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 rounded-xl p-4 flex justify-between items-center gap-4 text-xs"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-bold text-zinc-800 dark:text-white uppercase font-mono">
                        {evalItem.licensePlate}
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        {evalItem.vehicleSpecification.manufacturer.name}{' '}
                        {evalItem.vehicleSpecification.model.name} ({evalItem.vehicleSpecification.year})
                      </span>
                      <span className="text-[9px] text-zinc-400 dark:text-zinc-500 mt-1">
                        {evalItem.mileage.toLocaleString('tr-TR')} km | {evalItem.color} | Hasar:{' '}
                        {evalItem.damageStatus}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-brand-orange">
                        {evalItem.estimatedValue.toLocaleString('tr-TR')} ₺
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
