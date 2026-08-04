'use client';

import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Trash2, UserCheck, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  role: {
    id: string;
    name: string;
  };
}

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState('STAFF');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Kullanıcı listesi alınamadı.');
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          roleName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Kullanıcı eklenirken bir hata oluştu.');
      }

      setSuccess(`"${firstName} ${lastName}" başarıyla eklendi! Artık bu e-posta ve şifre ile giriş yapabilir.`);
      setFirstName('');
      setLastName('');
      setEmail('');
      setPassword('');
      setRoleName('STAFF');
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'İşlem başarısız.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`"${userName}" isimli çalışan hesabını silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Kullanıcı silinemedi.');

      setSuccess(`"${userName}" isimli kullanıcı hesabı başarıyla silindi.`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Silme işlemi başarısız.');
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-white/10 pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-brand-orange" />
            Çalışanlar & Kullanıcı Yönetimi
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Galeri personeli ve yöneticileri için e-posta & şifre ile güvenli admin paneli erişim hesapları tanımlayın.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          className="self-start md:self-auto flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-white/10 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </button>
      </div>

      {/* ADIM ADIM KULLANICI HESABI VE YETKİ REHBERİ */}
      <div className="bg-brand-orange/5 dark:bg-brand-orange/10 border border-brand-orange/20 p-5 rounded-3xl flex flex-col gap-3">
        <h3 className="text-xs font-black text-brand-orange uppercase tracking-wider flex items-center gap-2">
          📖 Sıfırdan Çalışan Ekleme ve Yetkilendirme Adım Adım Kullanım Kılavuzu
        </h3>
        <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
          İleride dükkanınıza/galerinize yeni elemanlar veya ortaklar aldığınızda, kendi özel e-posta adresi ve şifreleri ile Admin Paneline girebilmeleri için aşağıdaki adımları izleyin:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mt-1">
          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-brand-orange/15 flex flex-col gap-1">
            <span className="font-extrabold text-brand-orange">1. Adım: Formu Doldurun</span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
              Sol taraftaki kutudan çalışanın <b>Adı, Soyadı, E-posta adresi ve en az 6 haneli Giriş Şifresini</b> yazın.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-brand-orange/15 flex flex-col gap-1">
            <span className="font-extrabold text-brand-orange">2. Adım: Yetki Rolünü Seçin</span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
              <b>Galeri Çalışanı (STAFF)</b>: Değerleme ve Konsinye başvurularını görür, müşteriyle iletişim kurar.<br/>
              <b>Yönetici (ADMIN)</b>: Tüm ayarlara ve kullanıcı ekleme/silme yetkilerine sahiptir.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-brand-orange/15 flex flex-col gap-1">
            <span className="font-extrabold text-brand-orange">3. Adım: Çalışana Şifresini Verin</span>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-normal">
              <b>"Hesabı Oluştur & Yetkilendir"</b> butonuna basın. Çalışanınız artık <code>/admin</code> giriş sayfasından kendi mail ve şifresiyle girebilir. İstediğiniz zaman sağ listeden hesabı silebilirsiniz.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form: Add New User */}
        <div className="lg:col-span-1">
          <div className="glass-card rounded-3xl p-6 border border-zinc-200 dark:border-white/10 flex flex-col gap-6 sticky top-28">
            <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/10 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Yeni Çalışan Ekle</h2>
                <p className="text-[11px] text-zinc-500">Panel erişimi için mail & şifre belirleyin.</p>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Adı</label>
                  <input
                    type="text"
                    required
                    placeholder="Ahmet"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="glass-input rounded-xl p-3 text-xs w-full"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Soyadı</label>
                  <input
                    type="text"
                    required
                    placeholder="Yılmaz"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="glass-input rounded-xl p-3 text-xs w-full"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">E-posta Adresi</label>
                <input
                  type="email"
                  required
                  placeholder="calisan@nakitgaraj.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="glass-input rounded-xl p-3 text-xs w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Giriş Şifresi</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="glass-input rounded-xl p-3 text-xs w-full"
                />
                <span className="text-[10px] text-zinc-400 mt-0.5">En az 6 karakter olmalıdır.</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Erişim Rolü</label>
                <select
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className="glass-input rounded-xl p-3 text-xs w-full bg-white dark:bg-zinc-900"
                >
                  <option value="STAFF">Galeri Çalışanı (STAFF)</option>
                  <option value="ADMIN">Yönetici (ADMIN)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-4 rounded-xl text-xs transition-all shadow-lg shadow-brand-orange/20 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Hesap Oluşturuluyor...' : 'Hesabı Oluştur & Yetkilendir'}
              </button>
            </form>
          </div>
        </div>

        {/* Users Table / List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-brand-orange" />
              Kayıtlı Çalışanlar ve Yöneticiler ({users.length})
            </h2>
          </div>

          {loading ? (
            <div className="glass-card rounded-3xl p-12 text-center text-xs text-zinc-400">
              Kullanıcı listesi yükleniyor...
            </div>
          ) : users.length === 0 ? (
            <div className="glass-card rounded-3xl p-12 text-center text-xs text-zinc-400">
              Henüz tanımlanmış bir çalışan hesabı bulunmuyor.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="glass-card rounded-2xl p-5 border border-zinc-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-bold text-sm shrink-0">
                      {u.firstName.charAt(0)}{u.lastName.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">
                          {u.firstName} {u.lastName}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            u.role.name === 'ADMIN'
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          }`}
                        >
                          {u.role.name}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-500 font-mono mt-0.5">{u.email}</span>
                      <span className="text-[10px] text-zinc-400 mt-1">
                        Kayıt Tarihi: {new Date(u.createdAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t sm:border-t-0 border-zinc-100 dark:border-white/5 pt-3 sm:pt-0">
                    <button
                      onClick={() => handleDeleteUser(u.id, `${u.firstName} ${u.lastName}`)}
                      className="p-2.5 rounded-xl text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                      title="Hesabı Sil"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
