'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Clock, User, AlertCircle } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function AuditLogsList() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        const res = await fetch(`${API_BASE}/admin/logs`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Sistem günlükleri yüklenemedi.');
        const data = await res.json();
        setLogs(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  if (isLoading) {
    return <div className="text-zinc-500 dark:text-zinc-400 py-10 text-center">Sistem günlükleri yükleniyor...</div>;
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">Sistem Günlükleri</h2>
        <p className="text-xs text-zinc-500 mt-1">Sistem üzerinde gerçekleştirilen hassas yönetici işlemleri.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-4 rounded-xl flex items-start gap-2 max-w-lg">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 flex flex-col gap-4">
        {logs.length === 0 ? (
          <div className="text-center text-zinc-500 text-xs py-10">
            Kayıtlı sistem günlüğü bulunmuyor.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-zinc-150/50 dark:bg-white/3 border border-zinc-200 dark:border-white/5 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-brand-orange uppercase font-mono tracking-wider">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      IP: {log.ipAddress || 'Bilinmiyor'}
                    </span>
                  </div>
                  {log.entityName && (
                    <span className="text-zinc-700 dark:text-zinc-400 font-semibold mt-0.5 block">
                      Hedef Modül: {log.entityName} {log.entityId ? `(ID: ${log.entityId.substring(0, 8)})` : ''}
                    </span>
                  )}
                  {log.details && (
                    <div className="mt-2 p-2.5 rounded-lg bg-zinc-100 dark:bg-black/40 border border-zinc-200 dark:border-white/3 text-[10px] text-zinc-650 dark:text-zinc-500 font-mono overflow-x-auto max-w-xl">
                      {JSON.stringify(log.details)}
                    </div>
                  )}
                </div>

                <div className="text-right flex flex-col gap-1 justify-end items-end shrink-0">
                  {log.user && (
                    <span className="text-zinc-800 dark:text-zinc-300 font-semibold flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      {log.user.firstName} {log.user.lastName}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-600 mt-1 font-mono flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-450" />
                    {new Date(log.timestamp).toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
