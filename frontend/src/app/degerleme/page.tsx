'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Car,
  Calendar,
  Layers,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Search,
  Check,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  Clock,
  Gauge,
  Percent,
  CheckCircle,
  MapPin,
  X,
  PlusCircle,
  FileText,
  Send,
  User,
  Phone,
  Coins,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import RealisticCarDamageSchematic from '../../components/RealisticCarDamageSchematic';
import Link from 'next/link';
import { useLanguage } from '../../context/LanguageContext';
import ShinyText from '../../components/reactbits/ShinyText';

const BODY_PARTS = [
  'Motor Kaputu',
  'Tavan',
  'Sol Ön Çamurluk',
  'Sağ Ön Çamurluk',
  'Sol Ön Kapı',
  'Sağ Ön Kapı',
  'Sol Arka Kapı',
  'Sağ Arka Kapı',
  'Sol Arka Çamurluk',
  'Sağ Arka Çamurluk',
  'Bagaj Kapağı',
];

type PartStatus = 'ORIJINAL' | 'BOYALI' | 'LOKAL' | 'DEGISEN';

// Zod Schema for Step 2
const step2Schema = z.object({
  licensePlate: z
    .string()
    .min(1, 'Plaka alanı boş bırakılamaz.')
    .regex(/^(0[1-9]|[1-7][0-9]|8[0-1])[A-Z]{1,3}\d{2,4}$/, {
      message: 'Lütfen geçerli bir plaka giriniz. Örnek: 34ABC123',
    }),
  mileage: z.preprocess(
    (val) => (val === '' || val === undefined || val === null || isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ message: 'Kilometre alanı boş bırakılamaz.' })
      .min(1, 'Kilometre 1 veya daha büyük olmalıdır.')
  ),
  color: z.string().min(1, 'Lütfen bir renk seçiniz.'),
  damageStatus: z.enum(['YES', 'NO', 'UNKNOWN']),
  sellingTimeline: z.string().min(1, 'Lütfen satış süresi seçiniz.'),
  userDesiredPrice: z.preprocess(
    (val) => (val === '' || val === undefined || val === null || isNaN(Number(val)) ? undefined : Number(val)),
    z.number({ message: 'İstediğiniz fiyat alanı boş bırakılamaz.' })
      .min(1, 'İstediğiniz fiyat 1 TL veya daha yüksek olmalıdır.')
  ),
  kvkkAccepted: z.literal(true, {
    message: "Devam etmek için KVKK Aydınlatma Metni'ni onaylamanız gerekmektedir.",
  }),
});

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';

const VEHICLE_FEATURES = {
  security: [
    'ABS', 'AEB', 'BAS', 'Çocuk Kilidi', 'Distronic', 'ESP / VSA',
    'Gece Görüş Sistemi', 'Hava Yastığı (Sürücü)', 'Hava Yastığı (Yolcu)',
    'Immobilizer', 'Isofix', 'Kör Nokta Uyarı Sistemi', 'Merkezi Kilit',
    'Şerit Takip Sistemi', 'Yokuş Kalkış Desteği', 'Yorgunluk Tespit Sistemi', 'Zırhlı Araç'
  ],
  interior: [
    'Adaptive Cruise Control', 'Anahtarsız Giriş ve Çalıştırma', 'Deri Koltuk',
    'Elektrikli Camlar', 'Fonksiyonel Direksiyon', 'Geri Görüş Kamerası',
    'Head-up Display', 'Hız Sabitleme Sistemi', 'Hidrolik Direksiyon',
    'Isıtmalı Direksiyon', 'Klima', 'Koltuklar (Elektrikli)', 'Koltuklar (Hafızalı)',
    'Koltuklar (Isıtmalı)', 'Koltuklar (Soğutmalı)', 'Kumaş Koltuk',
    'Otm.Kararan Dikiz Aynası', 'Ön Görüş Kamerası', 'Ön Koltuk Kol Dayaması',
    'Soğutmalı Torpido', 'Start / Stop', 'Üçüncü Sıra Koltuklar', 'Yol Bilgisayarı'
  ],
  exterior: [
    'Ayakla Açılan Bagaj Kapağı', 'Hardtop', 'Far (Adaptif)', 'Aynalar (Elektrikli)',
    'Aynalar (Isıtmalı)', 'Aynalar (Hafızalı)', 'Park Sensörü (Arka)',
    'Park Sensörü (Ön)', 'Park Asistanı', 'Sunroof', 'Akıllı Bagaj Kapağı',
    'Panoramik Cam Tavan', 'Römork Çeki Demiri'
  ],
  multimedia: [
    'Android Auto', 'Apple CarPlay', 'Bluetooth', 'USB / AUX'
  ]
};

export default function ValuationWizard() {
  const { t, language } = useLanguage();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1 Taxonomy selections
  const [years, setYears] = useState<number[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);

  // Selected values
  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [selectedBodyType, setSelectedBodyType] = useState<string>('');
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [selectedTransmission, setSelectedTransmission] = useState<string>('');

  // Dynamically queried options
  const [availableVariants, setAvailableVariants] = useState<any[]>([]);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [availableBodies, setAvailableBodies] = useState<any[]>([]);
  const [availableFuels, setAvailableFuels] = useState<any[]>([]);
  const [availableTransmissions, setAvailableTransmissions] = useState<any[]>([]);

  // Detailed Appraisal (Paint Scheme & Status)
  const [paintParts, setPaintParts] = useState<Record<string, PartStatus>>({
    'Motor Kaputu': 'ORIJINAL',
    'Tavan': 'ORIJINAL',
    'Sol Ön Çamurluk': 'ORIJINAL',
    'Sağ Ön Çamurluk': 'ORIJINAL',
    'Sol Ön Kapı': 'ORIJINAL',
    'Sağ Ön Kapı': 'ORIJINAL',
    'Sol Arka Kapı': 'ORIJINAL',
    'Sağ Arka Kapı': 'ORIJINAL',
    'Sol Arka Çamurluk': 'ORIJINAL',
    'Sağ Arka Çamurluk': 'ORIJINAL',
    'Bagaj Kapağı': 'ORIJINAL',
  });

  const [chassisAction, setChassisAction] = useState(false);
  const [heavyDamage, setHeavyDamage] = useState(false);
  const [scratchDent, setScratchDent] = useState(false);
  const [crackedGlass, setCrackedGlass] = useState(false);
  const [tramerAmount, setTramerAmount] = useState<number | ''>('');
  const [modelSearchQuery, setModelSearchQuery] = useState('');

  // Missing Vehicle Request Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqBrand, setReqBrand] = useState('');
  const [reqModel, setReqModel] = useState('');
  const [reqYear, setReqYear] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqSuccessMsg, setReqSuccessMsg] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Müşteri bilgileri states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [userModalError, setUserModalError] = useState('');

  // Vehicle data loading states
  const [isVehicleDataLoading, setIsVehicleDataLoading] = useState(false);
  const [vehicleDataError, setVehicleDataError] = useState('');
  const [longLoadingWarning, setLongLoadingWarning] = useState(false);

  // Donanım özellikleri state
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>({
    not_sure_security: true,
    not_sure_interior: true,
    not_sure_exterior: true,
    not_sure_multimedia: true,
  });

  // SessionStorage check on mount
  useEffect(() => {
    const cachedFirst = sessionStorage.getItem('preEval_firstName');
    const cachedLast = sessionStorage.getItem('preEval_lastName');
    const cachedPhone = sessionStorage.getItem('preEval_phone');

    if (cachedFirst && cachedLast && cachedPhone) {
      setFirstName(cachedFirst);
      setLastName(cachedLast);
      setPhone(cachedPhone);
    } else {
      setShowUserModal(true);
    }
  }, []);

  const handleUserModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError('');

    if (!firstName.trim() || !lastName.trim()) {
      setUserModalError('Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }

    const cleanedPhone = phone.replace(/[^0-9]/g, '');
    const isValidPhone = /^(05|5)\d{9}$/.test(cleanedPhone);

    if (!isValidPhone) {
      setUserModalError('Geçersiz telefon numarası girdiniz. Lütfen kontrol edip tekrar deneyiniz.');
      return;
    }

    sessionStorage.setItem('preEval_firstName', firstName.trim());
    sessionStorage.setItem('preEval_lastName', lastName.trim());
    sessionStorage.setItem('preEval_phone', cleanedPhone);
    
    setPhone(cleanedPhone);
    setShowUserModal(false);
  };

  const toggleFeature = (featureName: string) => {
    setSelectedFeatures(prev => {
      const next = { ...prev };
      
      let category: 'security' | 'interior' | 'exterior' | 'multimedia' | null = null;
      if (VEHICLE_FEATURES.security.includes(featureName) || featureName === 'not_sure_security') {
        category = 'security';
      } else if (VEHICLE_FEATURES.interior.includes(featureName) || featureName === 'not_sure_interior') {
        category = 'interior';
      } else if (VEHICLE_FEATURES.exterior.includes(featureName) || featureName === 'not_sure_exterior') {
        category = 'exterior';
      } else if (VEHICLE_FEATURES.multimedia.includes(featureName) || featureName === 'not_sure_multimedia') {
        category = 'multimedia';
      }

      if (category) {
        const fallbackKey = `not_sure_${category}`;
        if (featureName === fallbackKey) {
          if (!prev[fallbackKey]) {
            VEHICLE_FEATURES[category].forEach(item => {
              next[item] = false;
            });
            next[fallbackKey] = true;
          } else {
            next[fallbackKey] = false;
          }
        } else {
          next[featureName] = !prev[featureName];
          if (next[featureName]) {
            next[fallbackKey] = false;
          }
        }
      } else {
        next[featureName] = !prev[featureName];
      }
      return next;
    });
  };

  const isEquipmentValid = () => {
    const hasSecurity = VEHICLE_FEATURES.security.some(item => selectedFeatures[item]) || !!selectedFeatures['not_sure_security'];
    const hasInterior = VEHICLE_FEATURES.interior.some(item => selectedFeatures[item]) || !!selectedFeatures['not_sure_interior'];
    const hasExterior = VEHICLE_FEATURES.exterior.some(item => selectedFeatures[item]) || !!selectedFeatures['not_sure_exterior'];
    const hasMultimedia = VEHICLE_FEATURES.multimedia.some(item => selectedFeatures[item]) || !!selectedFeatures['not_sure_multimedia'];
    
    return hasSecurity && hasInterior && hasExterior && hasMultimedia;
  };

  const isContactInfoValid = () => {
    const fName = (firstName || (typeof window !== 'undefined' ? sessionStorage.getItem('preEval_firstName') : '') || '').trim();
    const lName = (lastName || (typeof window !== 'undefined' ? sessionStorage.getItem('preEval_lastName') : '') || '').trim();
    const ph = (phone || (typeof window !== 'undefined' ? sessionStorage.getItem('preEval_phone') : '') || '').replace(/\D/g, '');
    return fName.length > 0 && lName.length > 0 && /^(05|5)\d{9}$/.test(ph);
  };

  // Step 3 valuation results
  const [valuationResult, setValuationResult] = useState<any>(null);
  const [showKvkk, setShowKvkk] = useState(false);

  const calculateEstimatedDamagePenalty = () => {
    let penalty = 0;
    for (const [part, status] of Object.entries(paintParts)) {
      if (status === 'DEGISEN') {
        penalty += (part === 'Motor Kaputu' || part === 'Tavan') ? 8 : 4;
      } else if (status === 'BOYALI') {
        penalty += (part === 'Motor Kaputu' || part === 'Tavan') ? 5 : 2;
      } else if (status === 'LOKAL') {
        penalty += (part === 'Motor Kaputu' || part === 'Tavan') ? 3 : 1;
      }
    }
    if (chassisAction) penalty += 25;
    if (heavyDamage) penalty += 35;
    if (scratchDent) penalty += 2;
    if (crackedGlass) penalty += 1;
    return Math.min(60, penalty);
  };

  const handleSendVehicleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqBrand || !reqModel) return;
    setIsSubmittingReq(true);
    setReqSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/vehicle-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: reqBrand,
          model: reqModel,
          year: reqYear ? Number(reqYear) : undefined,
          note: reqNote || undefined,
        }),
      });

      if (res.ok) {
        setReqSuccessMsg('Talebiniz yönetici ekibimize iletildi. En kısa sürede kataloğa eklenecektir!');
        setTimeout(() => {
          setShowRequestModal(false);
          setReqBrand('');
          setReqModel('');
          setReqYear('');
          setReqNote('');
          setReqSuccessMsg('');
        }, 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingReq(false);
    }
  };

  // Zod form binding
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(step2Schema),
    mode: 'onChange',
    defaultValues: {
      licensePlate: '',
      mileage: undefined as any,
      color: '',
      damageStatus: 'NO' as const,
      kvkkAccepted: false as any,
      sellingTimeline: '',
      userDesiredPrice: undefined as any,
    },
  });

  const watchMileage = watch('mileage') as number | undefined;

  // Colors list
  const trColors = [
    'Beyaz',
    'Siyah',
    'Gri',
    'Gümüş',
    'Kırmızı',
    'Mavi',
    'Sarı',
    'Yeşil',
    'Turuncu',
    'Kahverengi',
    'Lacivert',
    'Bej',
  ];

  // Fetch initial lookups
  useEffect(() => {
    fetch(`${API_BASE}/years`)
      .then((res) => res.json())
      .then((data) => setYears(Array.isArray(data) ? data : []))
      .catch(console.error);

    fetch(`${API_BASE}/brands`)
      .then((res) => res.json())
      .then((data) => setBrands(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, []);

  // Fetch models when brand changes
  useEffect(() => {
    if (selectedBrand) {
      fetch(`${API_BASE}/models?brandId=${selectedBrand}`)
        .then((res) => res.json())
        .then((data) => {
          const uniqueModels: any[] = [];
          const seenNames = new Set<string>();
          (data || []).forEach((m: any) => {
            const cleanName = m.name.replace(/-/g, ' ').toLowerCase();
            if (!seenNames.has(cleanName)) {
              seenNames.add(cleanName);
              uniqueModels.push(m);
            }
          });
          setModels(uniqueModels);
          // reset subordinate fields
          setSelectedModel('');
          resetSubordinateOptions();
        })
        .catch(console.error);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  const resetSubordinateOptions = () => {
    setSelectedVariant('');
    setSelectedPackage('');
    setSelectedBodyType('');
    setSelectedFuelType('');
    setSelectedTransmission('');
    setAvailableVariants([]);
    setAvailablePackages([]);
    setAvailableBodies([]);
    setAvailableFuels([]);
    setAvailableTransmissions([]);
  };

function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
  isLoading,
  loadingMessage,
  longLoadingWarning,
  errorMessage,
  onRetry,
  dataTestId,
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
  longLoadingWarning?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  dataTestId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((o) =>
    o.name.toLocaleLowerCase('tr-TR').includes(searchTerm.trim().toLocaleLowerCase('tr-TR'))
  );

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Hidden Native Select for Playwright test compatibility */}
      <select
        data-testid={dataTestId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || isLoading}
        onClick={() => setIsOpen(!isOpen)}
        className={`glass-input rounded-xl p-3.5 text-sm w-full text-left font-semibold flex items-center justify-between transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-brand-orange/50'
        } ${isOpen ? 'border-brand-orange ring-2 ring-brand-orange/20' : ''}`}
      >
        <span className={selectedOption ? 'text-zinc-900 dark:text-white font-bold' : 'text-zinc-400'}>
          {isLoading ? (
            <span className="flex items-center gap-2 text-brand-orange">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {loadingMessage || 'Motor / versiyon seçenekleri yükleniyor...'}
            </span>
          ) : selectedOption ? (
            selectedOption.name
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Long Loading Warning */}
      {isLoading && longLoadingWarning && (
        <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-medium flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Gerçek ilan verileri hazırlanıyor, lütfen kısa bir süre bekleyin.</span>
        </div>
      )}

      {/* Error State */}
      {errorMessage && (
        <div className="mt-1.5 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-medium flex items-center justify-between">
          <span>{errorMessage}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-2.5 py-1 rounded-md bg-red-500 text-white font-bold text-[10px] hover:bg-red-600 transition-all cursor-pointer"
            >
              Tekrar Dene
            </button>
          )}
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && !disabled && !isLoading && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box */}
          <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs w-full focus:outline-none text-zinc-900 dark:text-white font-semibold placeholder:text-zinc-400"
            />
          </div>

          {/* Options List (Max 8 visible items) */}
          <div className="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                    opt.id === value
                      ? 'bg-brand-orange text-white font-extrabold shadow-sm'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                  }`}
                >
                  <span>{opt.name}</span>
                  {opt.id === value && <Check className="w-4 h-4 text-white shrink-0" />}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-xs text-zinc-400 font-medium">
                Aramanızla eşleşen seçenek bulunamadı.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

  // Is Step 1 completed? (Year, Brand, Model and Variant are sufficient!)
  const isStep1Complete =
    selectedYear !== '' &&
    selectedBrand !== '' &&
    selectedModel !== '' &&
    (availableVariants.length === 0 || selectedVariant !== '');

  const handleStep1Next = () => {
    if (isStep1Complete) {
      setStep(2);
    }
  };

  const handleStep2Submit = async (formData: any) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/vehicle-evaluation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(selectedYear),
          manufacturerId: selectedBrand,
          modelId: selectedModel,
          variantId: selectedVariant,
          packageId: selectedPackage,
          bodyTypeId: selectedBodyType,
          fuelTypeId: selectedFuelType,
          transmissionTypeId: selectedTransmission,
          licensePlate: formData.licensePlate.toUpperCase(),
          mileage: Number(formData.mileage),
          color: formData.color,
          damageStatus: formData.damageStatus,
          tramerAmount: formData.damageStatus === 'YES' ? (tramerAmount ? `${Number(tramerAmount).toLocaleString('tr-TR')} TL` : 'Var') : (formData.damageStatus === 'NO' ? '0 TL' : 'Bilinmiyor'),
          paintScheme: JSON.stringify(paintParts),
          chassisState: JSON.stringify({ 'Şasi': chassisAction }),
          vehicleStatus: JSON.stringify({
            heavyDamage,
            scratchOrDent: scratchDent,
            crackedGlass,
          }),
          
          // Müşteri bilgileri
          firstName: firstName || sessionStorage.getItem('preEval_firstName') || '',
          lastName: lastName || sessionStorage.getItem('preEval_lastName') || '',
          phone: phone || sessionStorage.getItem('preEval_phone') || '',
          
          // Yeni sorular
          sellingTimeline: formData.sellingTimeline,
          userDesiredPrice: Number(formData.userDesiredPrice),
          
          // Donanım özellikleri
          features: JSON.stringify(selectedFeatures),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Değerleme işlemi başarısız.');
      }

      const result = await response.json();
      setValuationResult(result);
      setStep(3);
    } catch (error: any) {
      console.error('Valuation submission error:', error);
      const isNetworkError = error.message?.includes('NetworkError') || error.message?.includes('fetch');
      const friendlyMsg = isNetworkError
        ? 'Sunucu ile bağlantı kurulamadı (Backend servisi kapalı veya yanıt vermiyor). Lütfen backend sunucusunu başlatıp tekrar deneyiniz.'
        : (error.message || 'Değerleme sırasında bir hata oluştu, lütfen tekrar deneyiniz.');
      alert(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 md:px-8 py-10 md:py-16 flex-1 flex flex-col justify-center">
      {/* Progress Indicator */}
      <div className="flex items-center justify-between mb-8 max-w-md mx-auto w-full">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              disabled={s >= step}
              suppressHydrationWarning
              onClick={() => {
                if (s < step) setStep(s);
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border transition-all ${
                step >= s
                  ? 'bg-brand-orange text-white border-brand-orange shadow-lg shadow-brand-orange/20'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              } ${s < step ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
            >
              {s}
            </button>
            {s < 3 && (
              <div
                className={`h-0.5 flex-grow mx-2 transition-all ${
                  step > s ? 'bg-brand-orange' : 'bg-zinc-800'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            {/* Header & Description */}
            <div className="flex flex-col gap-2 border-b border-zinc-200 dark:border-white/10 pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20 shadow-sm">
                    <Car className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                      Aracınızı Adım Adım Seçin
                    </h2>
                    <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Önce aracınızın markasını seçin. Her seçimin ardından size uygun olan bir sonraki adım otomatik olarak açılacaktır.
                    </p>
                  </div>
                </div>

                {/* Reset selection button */}
                {(selectedYear || selectedBrand || selectedModel || selectedVariant || selectedPackage) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBrand('');
                      setSelectedYear('');
                      setSelectedModel('');
                      setModels([]);
                      resetSubordinateOptions();
                    }}
                    className="text-xs text-zinc-400 hover:text-brand-orange flex items-center gap-1 font-semibold transition-all px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-brand-orange/40"
                  >
                    <X className="w-3.5 h-3.5" /> Seçimleri Sıfırla
                  </button>
                )}
              </div>

              {/* 6-Step Visual Horizontal Progress Indicator */}
              <div className="grid grid-cols-6 gap-2 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/60">
                {[
                  { num: 1, label: 'Marka', active: !!selectedBrand },
                  { num: 2, label: 'Model Yılı', active: !!selectedYear },
                  { num: 3, label: 'Model', active: !!selectedModel },
                  { num: 4, label: 'Motor / Versiyon', active: !!selectedVariant },
                  { num: 5, label: 'Donanım Paketi', active: !!selectedPackage },
                  { num: 6, label: 'Araç Detayları', active: isStep1Complete },
                ].map((st) => {
                  const isCurrent =
                    (st.num === 1 && !selectedBrand) ||
                    (st.num === 2 && selectedBrand && !selectedYear) ||
                    (st.num === 3 && selectedYear && !selectedModel) ||
                    (st.num === 4 && selectedModel && !selectedVariant) ||
                    (st.num === 5 && selectedVariant && !selectedPackage) ||
                    (st.num === 6 && selectedPackage);

                  return (
                    <div key={st.num} className="flex flex-col items-center gap-1">
                      <div
                        className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                          st.active
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : isCurrent
                            ? 'bg-brand-orange text-white shadow-md shadow-brand-orange/30 ring-2 ring-brand-orange/40'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600'
                        }`}
                      >
                        {st.active ? <Check className="w-4 h-4" /> : st.num}
                      </div>
                      <span className={`text-[10px] font-semibold text-center hidden sm:inline ${
                        st.active ? 'text-emerald-600 dark:text-emerald-400' : isCurrent ? 'text-brand-orange font-bold' : 'text-zinc-400'
                      }`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Dynamic "Sıradaki Adım" Guidance Box */}
              <div className="mt-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-3 text-xs font-semibold">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                <span>
                  {!selectedBrand && 'Sıradaki Adım: Lütfen aşağıdaki listeden aracınızın markasını seçin.'}
                  {selectedBrand && !selectedYear && `Marka seçildi (${brands.find(b => b.id === selectedBrand)?.name || 'Seçildi'}). Şimdi 2. Adımdan model yılını seçin.`}
                  {selectedBrand && selectedYear && !selectedModel && `Model Yılı seçildi (${selectedYear}). Şimdi 3. Adımdan aracınızın modelini seçin.`}
                  {selectedBrand && selectedYear && selectedModel && !selectedVariant && `Model seçildi (${models.find(m => m.id === selectedModel)?.name || 'Seçildi'}). Şimdi 4. Adımdan motor/versiyon bilgisini seçin.`}
                  {selectedModel && selectedVariant && !selectedPackage && `Motor seçildi (${availableVariants.find(v => v.id === selectedVariant)?.name || 'Seçildi'}). Şimdi 5. Adımdan donanım paketini seçin.`}
                  {selectedPackage && 'Tüm araç bilgileri tamamlandı! Aşağıdaki "Sonraki Adım: Araç Bilgileri" butonuna tıklayarak devam edebilirsiniz.'}
                </span>
              </div>
            </div>

            {/* ADIM 1: MARKA SEÇİMİ */}
            <div className="flex flex-col gap-3 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-brand-orange text-white text-xs font-extrabold flex items-center justify-center">1</span>
                    Önce Aracınızın Markasını Seçin
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Aracınızın markasını arayın veya aşağıdaki popüler markalardan birini seçin.
                  </p>
                </div>
                {selectedBrand && (
                  <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                  </span>
                )}
              </div>

              {/* Marka Arama ve Seçim */}
              {(() => {
                const safeBrands = Array.isArray(brands) ? brands : [];
                return (
                  <div className="flex flex-col gap-3 pt-1">
                    {/* Top 8 Quick Brands Buttons */}
                    <div className="flex flex-wrap gap-2">
                      {safeBrands.slice(0, 12).map((bObj) => {
                        const isSelected = selectedBrand === bObj.id;
                        return (
                          <button
                            key={bObj.id}
                            data-testid={`brand-${bObj.name}`}
                            type="button"
                            onClick={() => {
                              setSelectedBrand(bObj.id);
                              setSelectedYear('');
                              setSelectedModel('');
                              resetSubordinateOptions();
                            }}
                            className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-brand-orange text-white border-brand-orange shadow-md shadow-brand-orange/20 scale-105'
                                : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-brand-orange/40 hover:text-brand-orange'
                            }`}
                          >
                            {bObj.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* All Brands Dropdown */}
                    <select
                      suppressHydrationWarning
                      value={selectedBrand}
                      onChange={(e) => {
                        setSelectedBrand(e.target.value);
                        setSelectedYear('');
                        setSelectedModel('');
                        resetSubordinateOptions();
                      }}
                      className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                    >
                      <option value="">-- Tüm Markalar ({safeBrands.length} Marka Katoloğumuzda Mevcut) --</option>
                      {safeBrands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>

            {/* ADIM 2 & ADIM 3 GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ADIM 2: MODEL YILI SEÇİMİ */}
              <div className={`flex flex-col gap-3 p-5 rounded-2xl border transition-all ${
                selectedBrand 
                  ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
                  : 'bg-zinc-100/40 dark:bg-zinc-900/20 border-zinc-200/50 dark:border-zinc-800/40 opacity-60 pointer-events-none select-none'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                        selectedBrand ? 'bg-brand-orange text-white' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500'
                      }`}>2</span>
                      Şimdi Aracınızın Model Yılını Seçin
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Aracınızın ruhsatında yazan imalat/model yılını seçin.
                    </p>
                  </div>
                  {!selectedBrand ? (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">🔒 Önce Marka Seçiniz</span>
                  ) : selectedYear ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                    </span>
                  ) : null}
                </div>
                <select
                  data-testid="vehicle-year"
                  suppressHydrationWarning
                  disabled={!selectedBrand}
                  value={selectedBrand ? selectedYear : ''}
                  onChange={(e) => {
                    if (!selectedBrand) return;
                    setSelectedYear(e.target.value ? Number(e.target.value) : '');
                    setSelectedModel('');
                    resetSubordinateOptions();
                  }}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold disabled:cursor-not-allowed"
                >
                  <option value="">{selectedBrand ? '-- Model Yılını Seçiniz --' : 'Önce Marka Seçiniz'}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y} Yılı
                    </option>
                  ))}
                </select>
              </div>

              {/* ADIM 3: MODEL SEÇİMİ */}
              <div className={`flex flex-col gap-3 p-5 rounded-2xl border transition-all ${
                selectedBrand && selectedYear 
                  ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
                  : 'bg-zinc-100/40 dark:bg-zinc-900/20 border-zinc-200/50 dark:border-zinc-800/40 opacity-60 pointer-events-none select-none'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                        selectedBrand && selectedYear ? 'bg-brand-orange text-white' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500'
                      }`}>3</span>
                      Aracınızın Modelini Seçin
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {selectedBrand && selectedYear ? `${brands.find(b => b.id === selectedBrand)?.name || ''} markasına ait modeller gösteriliyor.` : 'Önce marka ve model yılını seçin.'}
                    </p>
                  </div>
                  {(!selectedBrand || !selectedYear) ? (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">🔒 Önce Yıl Seçiniz</span>
                  ) : selectedModel ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                    </span>
                  ) : null}
                </div>

                {selectedBrand && selectedYear && models.length > 6 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                    <input
                      type="text"
                      placeholder={`${brands.find(b => b.id === selectedBrand)?.name || ''} modeli ara… Örn: 3 Serisi, 5 Serisi`}
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      className="glass-input rounded-lg py-2 pl-9 pr-3 text-xs w-full"
                    />
                  </div>
                )}

                <select
                  data-testid="vehicle-model"
                  suppressHydrationWarning
                  disabled={!selectedBrand || !selectedYear}
                  value={selectedBrand && selectedYear ? selectedModel : ''}
                  onChange={(e) => {
                    if (!selectedBrand || !selectedYear) return;
                    setSelectedModel(e.target.value);
                    resetSubordinateOptions();
                  }}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold disabled:cursor-not-allowed"
                >
                  <option value="">{selectedYear ? `-- Modeli Seçiniz (${models.length} Model Mevcut) --` : 'Önce Marka ve Yıl Seçiniz'}</option>
                  {models
                    .filter((m) => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* ADIM 4 & ADIM 5: MOTOR / VERSİYON & DONANIM PAKETİ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ADIM 4: MOTOR / VERSİYON */}
              <div className={`flex flex-col gap-3 p-5 rounded-2xl border transition-all ${
                selectedModel 
                  ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
                  : 'bg-zinc-100/40 dark:bg-zinc-900/20 border-zinc-200/50 dark:border-zinc-800/40 opacity-60 pointer-events-none select-none'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                        selectedModel ? 'bg-brand-orange text-white' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500'
                      }`}>4</span>
                      Motor / Versiyon Seçin
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Aracınızın 316i, 320i, 320d veya 1.4 TFSI gibi motor seçeneğini belirleyin.
                    </p>
                  </div>
                  {!selectedModel ? (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">🔒 Önce Model Seçiniz</span>
                  ) : selectedVariant ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                    </span>
                  ) : availableVariants.length > 0 ? (
                    <span className="text-[10px] font-bold text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-md">
                      {availableVariants.length} Seçenek Bulundu
                    </span>
                  ) : null}
                </div>

                <SearchableCombobox
                  dataTestId="vehicle-engine"
                  options={availableVariants}
                  value={selectedVariant}
                  onChange={(val) => {
                    if (!selectedModel) return;
                    setSelectedVariant(val);
                    setSelectedPackage('');
                    setSelectedBodyType('');
                    setSelectedFuelType('');
                    setSelectedTransmission('');
                  }}
                  disabled={!selectedModel}
                  isLoading={isVehicleDataLoading}
                  loadingMessage="Motor / versiyon seçenekleri yükleniyor..."
                  longLoadingWarning={longLoadingWarning}
                  errorMessage={vehicleDataError}
                  onRetry={() => {
                    setIsVehicleDataLoading(true);
                    setVehicleDataError('');
                  }}
                  placeholder={selectedModel ? `-- Motor / Versiyon Seçiniz (${availableVariants.length} Seçenek) --` : 'Önce Model Seçiniz'}
                  searchPlaceholder="Motor/versiyon ara... Örnek: 316i, 320i, 320d"
                />
              </div>

              {/* ADIM 5: DONANIM PAKETİ */}
              <div className={`flex flex-col gap-3 p-5 rounded-2xl border transition-all ${
                selectedVariant 
                  ? 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800' 
                  : 'bg-zinc-100/40 dark:bg-zinc-900/20 border-zinc-200/50 dark:border-zinc-800/40 opacity-60 pointer-events-none select-none'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center ${
                        selectedVariant ? 'bg-brand-orange text-white' : 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500'
                      }`}>5</span>
                      Donanım Paketini Seçin
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      M Sport, Sport Line, Modern Line veya Premium gibi donanım paketini seçin.
                    </p>
                  </div>
                  {!selectedVariant ? (
                    <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">🔒 Önce Motor Seçiniz</span>
                  ) : selectedPackage ? (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                    </span>
                  ) : availablePackages.length > 0 ? (
                    <span className="text-[10px] font-bold text-brand-orange bg-brand-orange/10 px-2 py-0.5 rounded-md">
                      {availablePackages.length} Paket Bulundu
                    </span>
                  ) : null}
                </div>

                <SearchableCombobox
                  dataTestId="vehicle-trim"
                  options={availablePackages.length > 0 ? availablePackages : [{ id: 'STANDART_FALLBACK', name: 'Paket bilgim yok / Standart' }]}
                  value={selectedPackage}
                  onChange={(val) => {
                    if (!selectedVariant) return;
                    setSelectedPackage(val);
                    setSelectedBodyType('');
                    setSelectedFuelType('');
                    setSelectedTransmission('');
                  }}
                  disabled={!selectedVariant}
                  isLoading={isVehicleDataLoading}
                  loadingMessage="Donanım paketleri yükleniyor..."
                  placeholder={selectedVariant ? 'Donanım Paketini Seçin' : 'Önce Motor Seçiniz'}
                  searchPlaceholder="Paket ara... Örnek: M Sport, Luxury Line, Comfort"
                />
              </div>
            </div>

            {/* Kasa Tipi, Yakıt Tipi ve Vites Tipi Seçim Alanı */}
            {selectedVariant && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                {/* Kasa Tipi */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.body')}</label>
                  {availableBodies.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      Bu araç için kasa tipi bilgisi bulunamadı.
                    </div>
                  ) : availableBodies.length === 1 ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between">
                      <span>{availableBodies[0].name}</span>
                      <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold">Otomatik seçildi</span>
                    </div>
                  ) : (
                    <select
                      value={selectedBodyType}
                      onChange={(e) => setSelectedBodyType(e.target.value)}
                      className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                    >
                      <option value="">{t('wiz.select')}</option>
                      {availableBodies.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Yakıt Tipi */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.fuel')}</label>
                  {availableFuels.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      Bu araç için yakıt tipi bilgisi bulunamadı.
                    </div>
                  ) : availableFuels.length === 1 ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between">
                      <span>{availableFuels[0].name}</span>
                      <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold">Otomatik seçildi</span>
                    </div>
                  ) : (
                    <select
                      value={selectedFuelType}
                      onChange={(e) => setSelectedFuelType(e.target.value)}
                      className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                    >
                      <option value="">{t('wiz.select')}</option>
                      {availableFuels.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Vites Tipi */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.transmission')}</label>
                  {availableTransmissions.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      Bu araç için vites tipi bilgisi bulunamadı.
                    </div>
                  ) : availableTransmissions.length === 1 ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between">
                      <span>{availableTransmissions[0].name}</span>
                      <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold">Otomatik seçildi</span>
                    </div>
                  ) : (
                    <select
                      value={selectedTransmission}
                      onChange={(e) => setSelectedTransmission(e.target.value)}
                      className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                    >
                      <option value="">{t('wiz.select')}</option>
                      {availableTransmissions.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Live Vehicle Selection Summary Badge */}
            {(selectedBrand || selectedModel) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-between flex-wrap gap-2"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-brand-orange" />
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      Seçilen Araç: {selectedYear} {brands.find((b) => b.id === selectedBrand)?.name} {models.find((m) => m.id === selectedModel)?.name}{' '}
                      {availableVariants.find((v) => v.id === selectedVariant)?.name ? `· ${availableVariants.find((v) => v.id === selectedVariant)?.name}` : ''}{' '}
                      {availablePackages.find((p) => p.id === selectedPackage)?.name ? `· ${availablePackages.find((p) => p.id === selectedPackage)?.name}` : ''}{' '}
                      {availableBodies.find((b) => b.id === selectedBodyType)?.name ? `· ${availableBodies.find((b) => b.id === selectedBodyType)?.name}` : ''}{' '}
                      {availableFuels.find((f) => f.id === selectedFuelType)?.name ? `· ${availableFuels.find((f) => f.id === selectedFuelType)?.name}` : ''}{' '}
                      {availableTransmissions.find((t) => t.id === selectedTransmission)?.name ? `· ${availableTransmissions.find((t) => t.id === selectedTransmission)?.name}` : ''}
                    </span>
                  </div>
                  {!isStep1Complete && (
                    <span className="text-[11px] text-zinc-500 font-medium">
                      Kasa ve yakıt bilgisi henüz belirlenmedi veya araç seçimi eksik.
                    </span>
                  )}
                </div>

                {isVehicleDataLoading ? (
                  <span className="text-[10px] font-black uppercase bg-amber-500 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Seçenekler Hazırlanıyor...
                  </span>
                ) : isStep1Complete ? (
                  <span className="text-[10px] font-black uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> ✓ SEÇİM TAMAMLANDI
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2.5 py-1 rounded-full">
                    Araç seçimi henüz tamamlanmadı
                  </span>
                )}
              </motion.div>
            )}

            {/* Note about dependency auto-population */}
            {selectedModel && (
              <p className="text-[11px] text-zinc-500 mt-4 italic">
                {language === 'tr'
                  ? '* Seçenekler filtrelendi. Tek eşleşen donanım bilgileri otomatik olarak doldurulmuştur.'
                  : '* Options filtered. Single matching specs have been auto-populated.'}
              </p>
            )}

            {/* Banner for unlisted model request */}
            <div className="mt-8 p-5 rounded-2xl bg-gradient-to-r from-brand-orange/10 via-rose-500/10 to-brand-orange/5 border border-brand-orange/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0 shadow-md shadow-brand-orange/30">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                    Aradığınız Marka veya Model Listede Yok mu?
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Bize hemen bildirin, ekibimiz inceleyip hızlıca sisteme eklesin!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="px-4 py-2.5 rounded-xl bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-xs shrink-0 transition-all cursor-pointer shadow-sm"
              >
                Talep Gönder
              </button>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                data-testid="step1-next-btn"
                suppressHydrationWarning
                disabled={!isStep1Complete}
                onClick={handleStep1Next}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 disabled:hover:bg-brand-orange text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                {t('wiz.next')}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">
                  <ShinyText text={t('wiz.step2.title')} speed={5} />
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('wiz.step2.desc')}</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(handleStep2Submit)} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* License Plate */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.plate')} (e.g. 34ABC123)</label>
                  <input
                    data-testid="vehicle-plate"
                    {...register('licensePlate', {
                      setValueAs: (v) => v.replace(/\s+/g, '').toUpperCase()
                    })}
                    placeholder="34ABC123"
                    className="glass-input rounded-xl p-3.5 text-sm uppercase"
                  />
                  {errors.licensePlate && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.licensePlate.message}
                    </span>
                  )}
                </div>

                {/* Mileage */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.mileage')}</label>
                  <input
                    data-testid="vehicle-mileage"
                    type="text"
                    placeholder="Örn: 85.000"
                    value={
                      watch('mileage')
                        ? Number(watch('mileage')).toLocaleString('tr-TR')
                        : ''
                    }
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setValue('mileage', raw ? Number(raw) : 0, {
                        shouldValidate: true,
                      });
                    }}
                    className="glass-input rounded-xl p-3.5 text-sm font-semibold"
                  />
                  {errors.mileage && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.mileage.message}
                    </span>
                  )}
                  {typeof watchMileage === 'number' && !isNaN(watchMileage) && watchMileage > 500000 ? (
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-500 font-medium mt-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>
                        {language === 'tr'
                          ? 'Uyarı: Girdiğiniz değer 500.000 km üzerindedir.'
                          : 'Warning: The value entered is above 500,000 km.'}
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Color */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.color')}</label>
                  <select
                    data-testid="vehicle-color"
                    {...register('color')}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {trColors.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                  {errors.color && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.color.message}
                    </span>
                  )}
                </div>

                {/* Damage Record */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.damage')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { val: 'NO', label: t('wiz.damage.no') },
                      { val: 'YES', label: t('wiz.damage.yes') },
                      { val: 'UNKNOWN', label: t('wiz.damage.unknown') },
                    ].map((item) => (
                      <label
                        key={item.val}
                        className={`flex items-center justify-center p-3 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          watch('damageStatus') === item.val
                            ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
                            : 'bg-zinc-100/60 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="radio"
                          value={item.val}
                          {...register('damageStatus')}
                          className="hidden"
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>

                  {/* Tramer Kaydı "VAR" Seçildiyse TL Tutar Girişi */}
                  {watch('damageStatus') === 'YES' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2.5 flex flex-col gap-1.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20"
                    >
                      <label className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Coins className="w-4 h-4" /> Tramer Kayıt Tutarı (TL)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Örn: 15.000"
                          value={tramerAmount !== '' ? Number(tramerAmount).toLocaleString('tr-TR') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setTramerAmount(raw ? Number(raw) : '');
                          }}
                          className="glass-input rounded-xl p-3 pr-10 text-sm w-full font-bold border-amber-500/30 focus:border-amber-500"
                        />
                        <span className="absolute right-4 top-3 text-amber-600 dark:text-amber-400 font-extrabold text-sm">₺</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Aracınızdaki bilinen toplam tramer hasar tutarını TL cinsinden giriniz.</p>
                    </motion.div>
                  )}
                </div>

                {/* Soru 1: Satış Süresi */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Bu aracın ne kadar sürede satılması gerekiyor? (Zorunlu)</label>
                  <select
                    data-testid="vehicle-timeline"
                    {...register('sellingTimeline')}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">Seçiniz...</option>
                    <option value="hemen">Hemen satmak istiyorum (Anında Nakit Alım)</option>
                    <option value="1_week">1 hafta içinde</option>
                    <option value="2_weeks">2 hafta içinde</option>
                    <option value="3_weeks">3 hafta içinde</option>
                    <option value="4_weeks">1 ay içinde</option>
                    <option value="4_8_weeks">1-2 ay içinde</option>
                  </select>
                  {errors.sellingTimeline && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.sellingTimeline.message}
                    </span>
                  )}
                </div>

                {/* Soru 2: İstenen Para Miktarı */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Bu araç için almak istediğiniz para miktarı nedir? (Zorunlu)</label>
                  <div className="relative">
                    <input
                      data-testid="vehicle-desired-price"
                      type="text"
                      placeholder="Örn: 1.200.000"
                      value={
                        watch('userDesiredPrice')
                          ? Number(watch('userDesiredPrice')).toLocaleString('tr-TR')
                          : ''
                      }
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '');
                        setValue('userDesiredPrice', raw ? Number(raw) : 0, {
                          shouldValidate: true,
                        });
                      }}
                      className="glass-input rounded-xl p-3.5 pr-10 text-sm w-full font-semibold"
                    />
                    <span className="absolute right-4 top-3.5 text-zinc-500 font-bold text-sm">₺</span>
                  </div>
                  {errors.userDesiredPrice && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.userDesiredPrice.message}
                    </span>
                  )}
                </div>

                {/* Interactive Boya & Değişen (Ekspertiz) Şeması */}
                <div className="col-span-1 md:col-span-2 flex flex-col gap-5 mt-4 pt-6 border-t border-zinc-200 dark:border-white/10">
                  
                  {/* Top Bar: Title & Live Penalty & Quick All-Original Button */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-orange/10 via-amber-500/5 to-transparent p-5 rounded-2xl border border-brand-orange/20">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center font-bold shadow-md shadow-brand-orange/30 shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                          Detaylı Ekspertiz Şeması (Boya / Değişen Bilgisi)
                        </h3>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          Aracınızın parça bazlı durumlarını seçerek nokta atışı değerleme hesaplatın.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                      {/* Live Penalty Badge */}
                      <div className="px-3.5 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-extrabold shadow-2xs">
                        Tahmini Değer Düşüşü: %{calculateEstimatedDamagePenalty()}
                      </div>

                      {/* Quick "Set All Original" Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const resetObj: Record<string, PartStatus> = {};
                          BODY_PARTS.forEach((p) => (resetObj[p] = 'ORIJINAL'));
                          setPaintParts(resetObj);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle className="w-4 h-4" /> Tümünü Orijinal Yap
                      </button>
                    </div>
                  </div>

                  {/* Real Image Interactive Schematic Component */}
                  <RealisticCarDamageSchematic
                    paintScheme={paintParts}
                    interactive={true}
                    onPartClick={(partName) => {
                      setPaintParts((prev) => {
                        const current = prev[partName] || 'ORIJINAL';
                        const nextMap: Record<string, PartStatus> = {
                          ORIJINAL: 'BOYALI',
                          BOYALI: 'LOKAL',
                          LOKAL: 'DEGISEN',
                          DEGISEN: 'ORIJINAL',
                        };
                        return { ...prev, [partName]: nextMap[current] || 'ORIJINAL' };
                      });
                    }}
                  />

                  {/* 11 Body Parts Grid (Ultra Clean Pill-Cards) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-1">
                    {BODY_PARTS.map((part) => {
                      const currentStatus = paintParts[part] || 'ORIJINAL';
                      
                      // Highlight border accent when modified from original
                      const isModified = currentStatus !== 'ORIJINAL';
                      let cardAccentClass = 'border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-950';
                      if (currentStatus === 'BOYALI') cardAccentClass = 'border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/20';
                      if (currentStatus === 'LOKAL') cardAccentClass = 'border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20';
                      if (currentStatus === 'DEGISEN') cardAccentClass = 'border-rose-500/40 bg-rose-500/5 ring-1 ring-rose-500/20';

                      return (
                        <div
                          key={part}
                          className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-3 shadow-2xs hover:shadow-md ${cardAccentClass}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                              <Car className="w-4 h-4 text-brand-orange shrink-0" />
                              {part}
                            </span>
                            {isModified && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
                                İşlemli
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { status: 'ORIJINAL', label: 'Orij', activeClass: 'bg-emerald-500 text-white shadow-sm font-black' },
                              { status: 'BOYALI', label: 'Boyalı', activeClass: 'bg-blue-600 text-white shadow-sm font-black' },
                              { status: 'LOKAL', label: 'Lokal', activeClass: 'bg-amber-500 text-white shadow-sm font-black' },
                              { status: 'DEGISEN', label: 'Değişen', activeClass: 'bg-rose-600 text-white shadow-sm font-black' },
                            ].map((opt) => {
                              const isSelected = currentStatus === opt.status;
                              return (
                                <button
                                  key={opt.status}
                                  type="button"
                                  onClick={() =>
                                    setPaintParts((prev) => ({
                                      ...prev,
                                      [part]: opt.status as PartStatus,
                                    }))
                                  }
                                  className={`py-2 px-1 rounded-xl text-[11px] font-bold transition-all duration-150 cursor-pointer text-center select-none ${
                                    isSelected
                                      ? `${opt.activeClass} scale-102`
                                      : 'bg-zinc-100 dark:bg-white/5 border border-zinc-200/60 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/10'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Extra Damage Checks (Şasi, Pert, Çizik/Göçük, Cam) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5 mt-3">
                    {[
                      { label: 'Şasi İşlemi / Hasarı Var', state: chassisAction, setState: setChassisAction, icon: '🛡️' },
                      { label: 'Ağır Hasar (Pert) Kaydı', state: heavyDamage, setState: setHeavyDamage, icon: '🚨' },
                      { label: 'Göçük / Çizik Var', state: scratchDent, setState: setScratchDent, icon: '🔨' },
                      { label: 'Ön Camda Kırık Var', state: crackedGlass, setState: setCrackedGlass, icon: '🔍' },
                    ].map((item, idx) => (
                      <label
                        key={idx}
                        className={`flex items-center gap-3 p-3.5 rounded-2xl border text-xs font-bold cursor-pointer transition-all duration-200 ${
                          item.state
                            ? 'bg-rose-500/15 border-rose-500/50 text-rose-700 dark:text-rose-300 shadow-xs'
                            : 'bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={item.state}
                          onChange={(e) => item.setState(e.target.checked)}
                          className="rounded text-brand-orange focus:ring-brand-orange w-4 h-4 shrink-0"
                        />
                        <span className="text-base">{item.icon}</span>
                        <span className="text-xs font-extrabold">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Araç Donanım Özellikleri */}
                <div className="col-span-1 md:col-span-2 flex flex-col gap-6 mt-4 pt-6 border-t border-zinc-200 dark:border-white/10">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-orange" />
                      Araç Donanım ve Konfor Özellikleri
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Aracınızda bulunan donanım ve güvenlik özelliklerini işaretleyiniz. Bu bilgiler değerlemeyi doğrudan etkiler.
                    </p>
                  </div>

                  <div className="flex flex-col gap-6">
                    {/* Güvenlik */}
                    <div className="p-5 rounded-2xl border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/3 flex flex-col gap-3">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-white/5 pb-2">🛡️ Güvenlik</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {VEHICLE_FEATURES.security.map(item => (
                          <label key={item} className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                            selectedFeatures[item]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-550 dark:text-zinc-400'
                          }`}>
                            <input
                              type="checkbox"
                              checked={!!selectedFeatures[item]}
                              onChange={() => toggleFeature(item)}
                              className="rounded text-brand-orange focus:ring-brand-orange w-3.5 h-3.5 mr-1"
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                        {/* Fallback Option */}
                        <label className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all col-span-2 sm:col-span-3 md:col-span-4 ${
                          selectedFeatures['not_sure_security']
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-zinc-150/40 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:border-amber-550/30'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!selectedFeatures['not_sure_security']}
                            onChange={() => toggleFeature('not_sure_security')}
                            className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 mr-1"
                          />
                          <span>Arabada ne olduğundan emin değilim</span>
                        </label>
                      </div>
                    </div>

                    {/* İç Donanım */}
                    <div className="p-5 rounded-2xl border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/3 flex flex-col gap-3">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-white/5 pb-2">🛋️ İç Donanım</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {VEHICLE_FEATURES.interior.map(item => (
                          <label key={item} className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                            selectedFeatures[item]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-550 dark:text-zinc-400'
                          }`}>
                            <input
                              type="checkbox"
                              checked={!!selectedFeatures[item]}
                              onChange={() => toggleFeature(item)}
                              className="rounded text-brand-orange focus:ring-brand-orange w-3.5 h-3.5 mr-1"
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                        {/* Fallback Option */}
                        <label className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all col-span-2 sm:col-span-3 md:col-span-4 ${
                          selectedFeatures['not_sure_interior']
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-zinc-150/40 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:border-amber-550/30'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!selectedFeatures['not_sure_interior']}
                            onChange={() => toggleFeature('not_sure_interior')}
                            className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 mr-1"
                          />
                          <span>Arabada ne olduğundan emin değilim</span>
                        </label>
                      </div>
                    </div>

                    {/* Dış Donanım */}
                    <div className="p-5 rounded-2xl border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/3 flex flex-col gap-3">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-white/5 pb-2">🚗 Dış Donanım</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {VEHICLE_FEATURES.exterior.map(item => (
                          <label key={item} className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                            selectedFeatures[item]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-550 dark:text-zinc-400'
                          }`}>
                            <input
                              type="checkbox"
                              checked={!!selectedFeatures[item]}
                              onChange={() => toggleFeature(item)}
                              className="rounded text-brand-orange focus:ring-brand-orange w-3.5 h-3.5 mr-1"
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                        {/* Fallback Option */}
                        <label className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all col-span-2 sm:col-span-3 md:col-span-4 ${
                          selectedFeatures['not_sure_exterior']
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-zinc-150/40 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-550 dark:text-zinc-450 hover:border-amber-550/30'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!selectedFeatures['not_sure_exterior']}
                            onChange={() => toggleFeature('not_sure_exterior')}
                            className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 mr-1"
                          />
                          <span>Arabada ne olduğundan emin değilim</span>
                        </label>
                      </div>
                    </div>

                    {/* Multimedya */}
                    <div className="p-5 rounded-2xl border border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/3 flex flex-col gap-3">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 border-b border-zinc-200 dark:border-white/5 pb-2">📻 Multimedya</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {VEHICLE_FEATURES.multimedia.map(item => (
                          <label key={item} className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                            selectedFeatures[item]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-zinc-550 dark:text-zinc-400'
                          }`}>
                            <input
                              type="checkbox"
                              checked={!!selectedFeatures[item]}
                              onChange={() => toggleFeature(item)}
                              className="rounded text-brand-orange focus:ring-brand-orange w-3.5 h-3.5 mr-1"
                            />
                            <span>{item}</span>
                          </label>
                        ))}
                        {/* Fallback Option */}
                        <label className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all col-span-2 sm:col-span-3 md:col-span-4 ${
                          selectedFeatures['not_sure_multimedia']
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                            : 'bg-zinc-150/40 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 text-zinc-555 dark:text-zinc-450 hover:border-amber-555/30'
                        }`}>
                          <input
                            type="checkbox"
                            checked={!!selectedFeatures['not_sure_multimedia']}
                            onChange={() => toggleFeature('not_sure_multimedia')}
                            className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5 mr-1"
                          />
                          <span>Arabada ne olduğundan emin değilim</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* KVKK Checkbox */}
                <div className="flex flex-col gap-2 mt-6 col-span-1 md:col-span-2">
                  <label data-testid="vehicle-kvkk-label" className="flex items-start gap-3 cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                    <input
                      data-testid="vehicle-kvkk-checkbox"
                      type="checkbox"
                      {...register('kvkkAccepted')}
                      className="mt-0.5 rounded border-zinc-300 dark:border-zinc-800 text-brand-orange focus:ring-brand-orange bg-white dark:bg-zinc-950 w-4 h-4 shrink-0"
                    />
                    <span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowKvkk(true);
                        }}
                        className="text-brand-orange hover:underline font-bold mr-1 inline"
                      >
                        {t('wiz.kvkk.link')}
                      </button>
                      {language === 'tr'
                        ? 'kapsamında araç verilerimin değerleme amaçlı işlenmesini ve kaydedilmesini kabul ediyorum.'
                        : 'I accept the processing and storing of my vehicle details for valuation purposes.'}
                    </span>
                  </label>
                  {errors.kvkkAccepted && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.kvkkAccepted.message as string}
                    </span>
                  )}
                </div>
                
                {!isContactInfoValid() && (
                  <div className="flex flex-col gap-3 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 col-span-1 md:col-span-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                      <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        Değerleme sonucunuzu oluşturabilmemiz için ad, soyad ve telefon bilgilerinizi tamamlayın.
                      </h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        placeholder="Adınız"
                        value={firstName}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                          setFirstName(raw);
                          sessionStorage.setItem('preEval_firstName', raw);
                        }}
                        data-testid="step2-first-name"
                        className="glass-input rounded-xl p-3 text-xs w-full font-semibold"
                      />
                      <input
                        type="text"
                        placeholder="Soyadınız"
                        value={lastName}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                          setLastName(raw);
                          sessionStorage.setItem('preEval_lastName', raw);
                        }}
                        data-testid="step2-last-name"
                        className="glass-input rounded-xl p-3 text-xs w-full font-semibold"
                      />
                      <input
                        type="tel"
                        placeholder="05xx xxx xx xx"
                        value={phone}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '');
                          setPhone(digits);
                          sessionStorage.setItem('preEval_phone', digits);
                        }}
                        data-testid="step2-phone"
                        className="glass-input rounded-xl p-3 text-xs w-full"
                      />
                    </div>
                  </div>
                )}

                {!isEquipmentValid() && (
                  <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold col-span-1 md:col-span-2">
                    <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                    <span>
                      {language === 'tr'
                        ? 'Lütfen her 4 donanım kategorisinden en az bir seçenek işaretleyin (Bilmiyorsanız "Arabada ne olduğundan emin değilim" seçeneğini seçebilirsiniz).'
                        : 'Please select at least one option from all 4 equipment categories (If you don\'t know, you can select "Arabada ne olduğundan emin değilim").'}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                  {t('wiz.back')}
                </button>
                <button
                  data-testid="vehicle-submit-button"
                  type="submit"
                  disabled={isLoading || !isEquipmentValid() || !isContactInfoValid()}
                  className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
                >
                  {isLoading ? (language === 'tr' ? 'Değerlendiriliyor...' : 'Evaluating...') : t('wiz.calculate')}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 3 && valuationResult && (() => {
          const status = valuationResult.status || (valuationResult.results ? 'SUCCESS' : 'ERROR');

          // Case 1: INSUFFICIENT_DATA
          if (status === 'INSUFFICIENT_DATA') {
            return (
              <motion.div
                key="step3-insufficient"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="insufficient-data-card"
                className="glass-card rounded-3xl p-8 border border-amber-500/30 text-center flex flex-col items-center gap-4 max-w-xl mx-auto w-full my-8"
              >
                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Bu araç için yeterli emsal bulunamadı.</h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  {valuationResult.message || 'Girmiş olduğunuz marka, model ve versiyona ait piyasada yeterli emsal ilan verisi henüz oluşturulmamıştır.'}
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl mt-2 transition-all cursor-pointer"
                >
                  Farklı Bir Araç Değerlendir
                </button>
              </motion.div>
            );
          }

          // Case 2: MANUAL_EVALUATION_REQUIRED
          if (status === 'MANUAL_EVALUATION_REQUIRED') {
            return (
              <motion.div
                key="step3-manual"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="manual-evaluation-card"
                className="glass-card rounded-3xl p-8 border border-blue-500/30 text-center flex flex-col items-center gap-4 max-w-xl mx-auto w-full my-8"
              >
                <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                  <HelpCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Bu araç için özel değerlendirme gereklidir.</h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  {valuationResult.message || 'Girdiğiniz araç segmenti veya kilometresi için uzman ekspertiz ekibimiz 30 dakika içerisinde telefonla sizinle iletişime geçecektir.'}
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl mt-2 transition-all cursor-pointer"
                >
                  Ana Sayfaya Dön
                </button>
              </motion.div>
            );
          }

          // Case 3: ERROR or DATA_INTEGRITY_ERROR
          if (status === 'ERROR' || status === 'DATA_INTEGRITY_ERROR') {
            return (
              <motion.div
                key="step3-error"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="api-error-card"
                className="glass-card rounded-3xl p-8 border border-red-500/30 text-center flex flex-col items-center gap-4 max-w-xl mx-auto w-full my-8"
              >
                <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Değerleme sırasında bir bağlantı hatası oluştu.</h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  {valuationResult.message || 'Lütfen internet bağlantınızı ve verilerinizi kontrol edip tekrar deneyiniz.'}
                </p>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl mt-2 transition-all cursor-pointer"
                >
                  Tekrar Dene
                </button>
              </motion.div>
            );
          }

          // Case 4: SUCCESS - Resolve Vehicle Safe Fallback
          const activeVehicle = valuationResult.vehicle || {
            brand: brands.find((b) => b.id === selectedBrand)?.name || 'BMW',
            model: models.find((m) => m.id === selectedModel)?.name || '3 Serisi',
            year: Number(selectedYear) || 2015,
            variant: availableVariants.find((v) => v.id === selectedVariant)?.name || '316i',
            package: availablePackages.find((p) => p.id === selectedPackage)?.name || 'M Sport',
            transmission: availableTransmissions.find((t) => t.id === selectedTransmission)?.name || '',
            fuelType: availableFuels.find((f) => f.id === selectedFuelType)?.name || '',
          };

          const activeResults = valuationResult.results;

          // If vehicle or results is null, display controlled error
          if (!activeVehicle || !activeResults) {
            console.error('Valuation vehicle or results object is null:', valuationResult);
            return (
              <motion.div
                key="step3-null-vehicle"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid="vehicle-null-error-card"
                className="glass-card rounded-3xl p-8 border border-red-500/30 text-center flex flex-col items-center gap-4 max-w-xl mx-auto w-full my-8"
              >
                <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Değerleme tamamlandı ancak araç bilgileri alınamadı. Lütfen tekrar deneyin.
                </h3>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl mt-2 transition-all cursor-pointer"
                >
                  Tekrar Dene
                </button>
              </motion.div>
            );
          }

          const cashOfferPrice = activeResults.finalOfferedPrice || activeResults.cashOffer || activeResults.estimatedValue || 0;
          const consignmentPrice = activeResults.finalConsignmentPrice || activeResults.consignmentListingPrice || activeResults.maxExpectedValue || 0;
          const fairMarketPrice = activeResults.fairMarketValue || 0;

          return (
            <motion.div
              key="step3-success"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="valuation-success-card"
              className="flex flex-col gap-8 w-full"
            >
              {/* Header summary */}
              <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-800/10 dark:border-white/5 text-center flex flex-col items-center gap-2">
                <span className="text-[10px] text-brand-orange uppercase font-extrabold tracking-widest bg-brand-orange/10 px-3 py-1 rounded-full border border-brand-orange/20">
                  {t('wiz.step3.title')}
                </span>
                <h2 data-testid="result-vehicle-name" className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white mt-2">
                  {activeVehicle.year} {activeVehicle.brand} {activeVehicle.model}
                </h2>
                <p data-testid="result-vehicle-details" className="text-xs text-zinc-500">
                  {activeVehicle.variant} {activeVehicle.package ? `- ${activeVehicle.package}` : ''}{' '}
                  {activeVehicle.transmission ? `- ${activeVehicle.transmission}` : ''} {activeVehicle.fuelType ? `- ${activeVehicle.fuelType}` : ''}
                </p>
              </div>

              {/* Valuation Stats Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Price display */}
                <div className="md:col-span-2 glass-card rounded-3xl p-6 md:p-8 border border-brand-orange/30 dark:border-brand-orange/20 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-brand-orange/5 via-transparent to-emerald-500/5">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange/10 rounded-bl-[100px] blur-[30px] pointer-events-none" />

                  {/* Piyasa Değeri Rozeti */}
                  <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Tahmini Piyasa Değeri:</span>
                    <span data-testid="result-fair-market-value" className="text-lg font-black text-zinc-900 dark:text-white">
                      {fairMarketPrice.toLocaleString('tr-TR')} ₺
                    </span>
                  </div>

                  {/* 2 MAIN SELLING OPTIONS COMPARISON */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    {/* SEÇENEK 1: Anında Nakit Alım */}
                    <div className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border-2 border-emerald-500/40 relative overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider mb-2">
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                          1. Anında Nakit Alım Teklifi
                        </div>
                        <div data-testid="result-cash-offer" className="text-3xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-1">
                          {cashOfferPrice.toLocaleString('tr-TR')} ₺
                        </div>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mt-2 leading-relaxed">
                          Aracınızı <strong>30 dakikada nakit sizden satın alırız</strong>.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                        ⚡ Anında ödeme & Sıfır bürokrasi
                      </div>
                    </div>

                    {/* SEÇENEK 2: Konsinye (Dükkana Bırakma) Satış */}
                    <div className="p-5 rounded-2xl bg-brand-orange/10 dark:bg-brand-orange/15 border-2 border-brand-orange/40 relative overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-orange text-white text-[11px] font-black uppercase tracking-wider mb-2">
                          🎯 2. Dükkana (Konsinye) Bırakma Fiyatı
                        </div>
                        <div data-testid="result-consignment-price" className="text-3xl lg:text-4xl font-black text-brand-orange tracking-tight mt-1">
                          {consignmentPrice.toLocaleString('tr-TR')} ₺
                        </div>
                        <p className="text-xs font-semibold text-brand-orange/90 dark:text-orange-200 mt-2 leading-relaxed">
                          Aracınızı dükkanımıza emanet bırakırsanız, <strong>sizin adınıza bu fiyata satarız.</strong>
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-brand-orange/20 text-[11px] text-brand-orange font-bold flex items-center gap-1">
                        🏪 Galerimizde sergileme & Yüksek kazanç
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Stats Card */}
                <div className="glass-card rounded-3xl p-6 border border-zinc-800/10 dark:border-white/5 flex flex-col justify-between gap-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Güven Skoru</div>
                        <div className="text-lg font-extrabold text-zinc-900 dark:text-white">
                          %{activeResults.confidenceScore || 85}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Kullanılan Emsal İlan</div>
                        <div className="text-lg font-extrabold text-zinc-900 dark:text-white">
                          {activeResults.matchedListingCount || 0} Adet Real İlan
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Analysis section */}
              {Array.isArray(valuationResult.aiAnalysis) && valuationResult.aiAnalysis.length > 0 && (
                <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-4">
                  <h3 className="text-md font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-orange" />
                    {t('wiz.step3.ai')}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {valuationResult.aiAnalysis.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 bg-zinc-800/5 dark:bg-white/3 p-3.5 rounded-xl border border-zinc-800/10 dark:border-white/3">
                        <CheckCircle className="w-4 h-4 text-brand-orange mt-0.5 shrink-0" />
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Consignment Banner */}
              <div className="bg-gradient-to-r from-brand-orange/15 to-transparent border border-brand-orange/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 mt-4">
                <div className="flex flex-col gap-2 text-center md:text-left">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t('wiz.step3.banner.title')}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xl">
                    {t('wiz.step3.banner.desc')}
                  </p>
                </div>

                <Link
                  href={`/konsinye?evaluationId=${valuationResult.evaluationId || ''}`}
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-xs py-3.5 px-6 rounded-xl transition-all hover:shadow-lg hover:shadow-brand-orange/25 shrink-0"
                >
                  {t('wiz.step3.banner.btn')}
                </Link>
              </div>

              {/* Reset wizard */}
              <div className="flex items-center justify-center gap-6 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs text-brand-orange hover:underline font-bold cursor-pointer"
                >
                  ← Geri Dön (Bilgileri Düzenle)
                </button>
                <span className="text-zinc-500">|</span>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setValuationResult(null);
                    setSelectedYear('');
                    setSelectedBrand('');
                    setSelectedModel('');
                    resetSubordinateOptions();
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline font-medium cursor-pointer"
                >
                  {t('wiz.step3.new')}
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Missing Vehicle Request Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card rounded-3xl p-6 md:p-8 max-w-md w-full border border-zinc-200 dark:border-white/10 relative shadow-2xl"
            >
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setReqSuccessMsg('');
                }}
                className="absolute top-5 right-5 text-zinc-400 hover:text-zinc-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Marka / Model Ekleme Talebi</h3>
                  <p className="text-xs text-zinc-500">Bulamadığınız aracı yazın, yönetici panelimize düşsün.</p>
                </div>
              </div>

              {reqSuccessMsg ? (
                <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs text-center flex flex-col items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                  <span className="font-bold">{reqSuccessMsg}</span>
                </div>
              ) : (
                <form onSubmit={handleSendVehicleRequest} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Marka (Zorunlu)</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Chery, BYD, Tofaş..."
                      value={reqBrand}
                      onChange={(e) => setReqBrand(e.target.value)}
                      className="glass-input rounded-xl p-3 text-xs w-full mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Model (Zorunlu)</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: Tiggo 8 Pro, Seal, Şahin..."
                      value={reqModel}
                      onChange={(e) => setReqModel(e.target.value)}
                      className="glass-input rounded-xl p-3 text-xs w-full mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Yıl (Opsiyonel)</label>
                      <input
                        type="number"
                        placeholder="2023"
                        value={reqYear}
                        onChange={(e) => setReqYear(e.target.value)}
                        className="glass-input rounded-xl p-3 text-xs w-full mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">İletişim (Opsiyonel)</label>
                      <input
                        type="text"
                        placeholder="E-posta veya Tel"
                        value={reqNote}
                        onChange={(e) => setReqNote(e.target.value)}
                        className="glass-input rounded-xl p-3 text-xs w-full mt-1"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReq || !reqBrand || !reqModel}
                    className="mt-2 w-full bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-brand-orange/20"
                  >
                    {isSubmittingReq ? 'Gönderiliyor...' : 'Talebi Gönder'}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* KVKK Modal Popup */}
      <AnimatePresence>
        {showKvkk && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-xl w-full max-h-[80vh] overflow-y-auto p-6 md:p-8 border border-zinc-800/10 dark:border-white/10 rounded-3xl flex flex-col gap-6"
            >
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t('wiz.kvkk.link')}</h3>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {language === 'tr' ? 'Kişisel Verilerin Korunması Kanunu Kapsamında Bilgilendirme' : 'Information Under the Personal Data Protection Law'}
                </p>
              </div>

              <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed flex flex-col gap-4 overflow-y-auto pr-2 max-h-[50vh]">
                <p className="font-semibold text-zinc-800 dark:text-white">
                  {language === 'tr' ? '1. Veri Sorumlusu ve Amaç' : '1. Data Controller and Purpose'}
                </p>
                <p>
                  {language === 'tr'
                    ? 'NakitGaraj Platformu olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, araç değerleme ve konsinye başvuru hizmetlerimizin ifası kapsamında tarafımıza iletmiş olduğunuz araç plaka bilgisi, kilometre, hasar geçmişi, renk ve iletişim detayları gibi bilgileri; değerleme doğruluğunun teyit edilmesi, pazar kıyaslamasının hesaplanması, teklif hazırlanması ve sizinle irtibat kurulabilmesi amaçlarıyla işlemekteyiz.'
                    : 'As NakitGaraj Platform, in accordance with the Personal Data Protection Law No. 6698 ("KVKK"), we process vehicle license plate information, mileage, damage history, color and communication details for checking valuation accuracy, computing market benchmarks, preparing offers, and contacting you.'}
                </p>
                <p className="font-semibold text-zinc-800 dark:text-white">
                  {language === 'tr' ? '2. Verilerin Aktarılması' : '2. Data Transfer'}
                </p>
                <p>
                  {language === 'tr'
                    ? 'Kişisel verileriniz, yasal veri API sağlayıcıları (Data Değer, Cardata vb.) ile yalnızca araç kimlik doğrulama ve fiyat katsayılarının analizi için güvenli sunucu kanalları üzerinden paylaşılmaktadır. Sahibinden veya diğer pazaryerlerindeki ilan analizleri anonim olarak yapılmakta olup, kişisel verileriniz izinsiz üçüncü şahıslarla paylaşılmaz.'
                    : 'Your personal data is shared with licensed data providers (Data Deger, Cardata, etc.) solely for vehicle identification checks and pricing engine factor computations. Comparable listings from marketplaces are parsed anonymously.'}
                </p>
                <p className="font-semibold text-zinc-800 dark:text-white">
                  {language === 'tr' ? '3. Kişisel Veri Sahibinin Hakları' : '3. Rights of the Data Subject'}
                </p>
                <p>
                  {language === 'tr'
                    ? 'KVKK Madde 11 uyarınca, verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacına uygun kullanılıp kullanılmadığını öğrenme, eksik veya yanlış işlenmişse düzeltilmesini isteme ve silinmesini talep etme hakkınız bulunmaktadır.'
                    : 'Under KVKK Article 11, you have the right to learn whether your data is processed, request information, check if it is used for the intended purpose, and ask for corrections or erasure.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowKvkk(false)}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3 rounded-xl text-xs transition-all w-full cursor-pointer"
              >
                {language === 'tr' ? 'Kapat ve Onayla' : 'Close and Approve'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* İletişim Bilgileri Fallback Modalı */}
      <AnimatePresence>
        {showUserModal && (
          <div data-testid="welcome-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-md w-full p-6 md:p-8 border border-zinc-200 dark:border-white/10 rounded-3xl flex flex-col gap-5 relative bg-white dark:bg-zinc-900 shadow-2xl"
            >
              {/* Top-Right Close (X) Button */}
              <button
                data-testid="welcome-skip-button"
                data-modal-close="true"
                type="button"
                onClick={() => {
                  setShowUserModal(false);
                  setUserModalError('');
                }}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-700 flex items-center justify-center transition-all"
                title="Kapat / İptal"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 pr-8">
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Değerleme Girişi</h3>
                  <p className="text-xs text-zinc-500">Devam etmek için lütfen iletişim bilgilerinizi doğrulayın.</p>
                </div>
              </div>

              {userModalError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-650 dark:text-red-400 text-xs p-3 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{userModalError}</span>
                </div>
              )}

              <form onSubmit={handleUserModalSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Adınız</label>
                    <input
                      data-testid="welcome-first-name"
                      type="text"
                      required
                      placeholder="Ahmet"
                      value={firstName}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                        const formatted = raw.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                        setFirstName(formatted);
                      }}
                      className="glass-input rounded-xl p-3 text-xs w-full mt-1 font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Soyadınız</label>
                    <input
                      data-testid="welcome-last-name"
                      type="text"
                      required
                      placeholder="Yılmaz"
                      value={lastName}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                        const formatted = raw.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                        setLastName(formatted);
                      }}
                      className="glass-input rounded-xl p-3 text-xs w-full mt-1 font-semibold"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Telefon Numaranız</label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                    <input
                      data-testid="welcome-phone"
                      type="tel"
                      required
                      placeholder="05xx xxx xx xx"
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setPhone(digits);
                      }}
                      maxLength={11}
                      className="glass-input rounded-xl p-3 pl-9 text-xs w-full"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-550 mt-1">Lütfen geçerli 10 veya 11 haneli TR telefon numarası giriniz.</p>
                </div>

                <button
                  data-testid="welcome-continue-button"
                  type="submit"
                  className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3 rounded-xl text-xs transition-all cursor-pointer mt-2"
                >
                  Kaydet & Başla
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
