'use client';

import React, { useEffect, useState } from 'react';
import { HelpCircle, Check, X, Search, Clock, RefreshCw, Car } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function VehicleRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/vehicle-requests`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequestsSilent = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/vehicle-requests`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequestsSilent, 3000); // 3-second live auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/vehicle-requests/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setRequests((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status } : item))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.email && req.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (req.phone && req.phone.includes(searchTerm));

    const matchesStatus =
      statusFilter === 'ALL' || req.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <Car className="w-6 h-6 text-brand-orange" />
            Araç Ekleme Talepleri
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Kullanıcıların sitemizde bulamayıp talep ettiği marka ve modeller.
          </p>
        </div>

        <button
          onClick={fetchRequests}
          className="inline-flex items-center gap-2 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-zinc-200 dark:border-white/10 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Marka, model veya kullanıcı ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full glass-input pl-10 pr-4 py-2.5 rounded-xl text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {['ALL', 'PENDING', 'ADDED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-brand-orange text-white'
                  : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
              }`}
            >
              {st === 'ALL'
                ? 'Tümü'
                : st === 'PENDING'
                ? 'Bekleyenler'
                : st === 'ADDED'
                ? 'Eklendi'
                : 'Reddedildi'}
            </button>
          ))}
        </div>
      </div>

      {/* Table List */}
      <div className="glass-card rounded-3xl overflow-hidden border border-zinc-800/10 dark:border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 text-xs text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                <th className="py-4 px-6">Talep Edilen Araç</th>
                <th className="py-4 px-6">Yıl</th>
                <th className="py-4 px-6">İletişim / Not</th>
                <th className="py-4 px-6">Tarih</th>
                <th className="py-4 px-6">Durum</th>
                <th className="py-4 px-6 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-white/5 text-xs">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    Henüz araç talebi bulunmuyor.
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-zinc-50/50 dark:hover:bg-white/2 transition-colors"
                  >
                    <td className="py-4 px-6 font-bold text-zinc-900 dark:text-white">
                      {req.brand} {req.model}
                    </td>
                    <td className="py-4 px-6 text-zinc-600 dark:text-zinc-300">
                      {req.year || '-'}
                    </td>
                    <td className="py-4 px-6 text-zinc-600 dark:text-zinc-300 max-w-xs">
                      {req.email && <div className="font-mono">{req.email}</div>}
                      {req.phone && <div className="font-mono">{req.phone}</div>}
                      {req.note && <div className="text-[11px] text-zinc-400 italic mt-0.5">{req.note}</div>}
                      {!req.email && !req.phone && !req.note && '-'}
                    </td>
                    <td className="py-4 px-6 text-zinc-400 font-mono text-[11px]">
                      {new Date(req.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          req.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : req.status === 'ADDED'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                        }`}
                      >
                        {req.status === 'PENDING'
                          ? 'Bekliyor'
                          : req.status === 'ADDED'
                          ? 'Kataloğa Eklendi'
                          : 'Reddedildi'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {req.status !== 'ADDED' && (
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'ADDED')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-all cursor-pointer"
                            title="Kataloğa Eklendi İşaretle"
                          >
                            <Check className="w-3.5 h-3.5 inline mr-1" />
                            Eklendi
                          </button>
                        )}
                        {req.status !== 'REJECTED' && (
                          <button
                            onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                            className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-[11px] font-bold transition-all cursor-pointer"
                            title="Reddet"
                          >
                            <X className="w-3.5 h-3.5 inline mr-1" />
                            Reddet
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
