'use client';

import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, AlertCircle, FileSpreadsheet } from 'lucide-react';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function VehicleDataImport() {
  const [format, setFormat] = useState('excel'); // excel, csv, json
  const [file, setFile] = useState<File | null>(null);
  const [jsonDataText, setJsonDataText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMsg('');
      setResult(null);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setResult(null);

    if (format !== 'json' && !file) {
      setErrorMsg('Lütfen içe aktarılacak bir dosya seçin.');
      return;
    }

    if (format === 'json' && !jsonDataText.trim() && !file) {
      setErrorMsg('Lütfen geçerli bir JSON verisi girin veya JSON dosyası yükleyin.');
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const formData = new FormData();
      formData.append('format', format);

      if (format === 'json') {
        if (file) {
          formData.append('file', file);
        } else {
          // Parse text locally first to validate syntax
          const parsed = JSON.parse(jsonDataText);
          formData.append('data', JSON.stringify(parsed));
        }
      } else {
        formData.append('file', file!);
      }

      const res = await fetch(`${API_BASE}/admin/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Veri aktarımı sırasında bir hata oluştu.');
      }

      const data = await res.json();
      setResult(data);
      setFile(null);
      setJsonDataText('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl flex flex-col gap-8 w-full">
      <div>
        <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">Veri Yükleme Motoru</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Master araç veri tabanına dışarıdan veri aktarın. (Excel, CSV veya JSON formatlarını destekler)
        </p>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs p-4 rounded-xl flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs p-5 rounded-2xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Aktarım Başarılı</h4>
            <p className="mt-1 leading-relaxed">{result.message}</p>
            <div className="flex gap-4 mt-3 font-semibold text-[10px] uppercase">
              <span>Yeni Eklenen: {result.inserted}</span>
              <span>Güncellenen: {result.updated}</span>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleImportSubmit} className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-200 dark:border-white/5 flex flex-col gap-6">
        {/* Select Format */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Veri Formatı</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: 'excel', label: 'Excel (XLSX/XLS)' },
              { val: 'csv', label: 'CSV (Virgülle Ayrılmış)' },
              { val: 'json', label: 'JSON Nesnesi' },
            ].map((item) => (
              <label
                key={item.val}
                className={`flex items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                  format === item.val
                    ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
                    : 'bg-zinc-100/60 border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  value={item.val}
                  checked={format === item.val}
                  onChange={() => {
                    setFormat(item.val);
                    setResult(null);
                    setErrorMsg('');
                  }}
                  className="hidden"
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        {/* Drop zone for File or Text Area for JSON */}
        {format === 'json' && !file ? (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">JSON Metni</label>
              <button
                type="button"
                onClick={() => setFile(null)} // resets to file uploading
                className="text-[10px] text-zinc-500 hover:underline cursor-pointer"
              >
                Veya JSON dosyası yükle
              </button>
            </div>
            <textarea
              rows={8}
              value={jsonDataText}
              onChange={(e) => setJsonDataText(e.target.value)}
              placeholder={`[
  {
    "brand": "Fiat",
    "model": "Egea",
    "variant": "1.4 Fire",
    "package": "Easy",
    "year": 2024,
    "bodyType": "Sedan",
    "fuelType": "Benzin",
    "transmissionType": "Manuel",
    "driveType": "Önden Çekiş",
    "price": 720000
  }
]`}
              className="glass-input rounded-2xl p-4 text-xs font-mono w-full resize-none"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Dosya Yükle</label>
            <div className="relative border border-dashed border-zinc-200 dark:border-white/10 hover:border-brand-orange/40 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-colors bg-zinc-100/50 dark:bg-zinc-900/30">
              <input
                type="file"
                accept={format === 'excel' ? '.xlsx, .xls' : format === 'csv' ? '.csv' : '.json'}
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="text-center">
                <span className="text-xs text-zinc-850 dark:text-white font-semibold block">
                  {file ? file.name : 'Dosya seçmek için tıklayın veya sürükleyin'}
                </span>
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : `${format.toUpperCase()} formatında dosya`}
                </span>
              </div>
            </div>
          </div>
        )}

        {format === 'json' && file && (
          <button
            type="button"
            onClick={() => setFile(null)}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-white underline text-left cursor-pointer"
          >
            Dosya yerine metin girmek istiyorum
          </button>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 px-8 rounded-xl text-sm transition-all duration-300 w-full mt-4 cursor-pointer"
        >
          {isLoading ? 'Veriler İşleniyor...' : 'Veri Aktarımını Başlat'}
        </button>
      </form>

      {/* Structure Guide */}
      <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/5 text-xs text-zinc-500 dark:text-zinc-400 flex flex-col gap-3">
        <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-brand-orange" />
          Veri Sütun Yapısı Kılavuzu
        </h4>
        <p className="leading-relaxed">
          Aktaracağınız dosyada en az aşağıdaki sütunların tanımlanması gerekmektedir:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[10px] text-zinc-600 dark:text-zinc-300 mt-2 bg-zinc-100 dark:bg-black/40 p-3.5 rounded-xl border border-zinc-200 dark:border-white/3">
          <span>brand (Fiat)</span>
          <span>model (Egea)</span>
          <span>variant (1.4 Fire)</span>
          <span>package (Easy)</span>
          <span>year (2024)</span>
          <span>bodyType (Sedan)</span>
          <span>fuelType (Benzin)</span>
          <span>transmissionType (Manuel)</span>
          <span>driveType (Önden Çekiş)</span>
          <span>price (720000)</span>
        </div>
      </div>
    </div>
  );
}
