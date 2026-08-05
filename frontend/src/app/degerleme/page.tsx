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

  // Donanım özellikleri state
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, boolean>>({});

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
      .then((data) => setYears(data))
      .catch(console.error);

    fetch(`${API_BASE}/brands`)
      .then((res) => res.json())
      .then((data) => setBrands(data))
      .catch(console.error);
  }, []);

  // Fetch models when brand changes
  useEffect(() => {
    if (selectedBrand) {
      fetch(`${API_BASE}/models?brandId=${selectedBrand}`)
        .then((res) => res.json())
        .then((data) => {
          setModels(data);
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

  // Fetch dynamic specification options when core items are selected
  useEffect(() => {
    if (selectedYear && selectedBrand && selectedModel) {
      const queryParams = new URLSearchParams({
        year: String(selectedYear),
        manufacturerId: selectedBrand,
        modelId: selectedModel,
      });

      if (selectedVariant) queryParams.append('variantId', selectedVariant);
      if (selectedPackage) queryParams.append('packageId', selectedPackage);
      if (selectedBodyType) queryParams.append('bodyTypeId', selectedBodyType);
      if (selectedFuelType) queryParams.append('fuelTypeId', selectedFuelType);
      if (selectedTransmission) {
        queryParams.append('transmissionTypeId', selectedTransmission);
      }

      fetch(`${API_BASE}/vehicle-data?${queryParams.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setAvailableVariants(data.variants || []);
          setAvailablePackages(data.packages || []);
          setAvailableBodies(data.bodyTypes || []);
          setAvailableFuels(data.fuelTypes || []);
          setAvailableTransmissions(data.transmissionTypes || []);

          // Apply Auto-Population suggestions from backend
          const auto = data.autoPopulate || {};
          if (auto.variantId && !selectedVariant) setSelectedVariant(auto.variantId);
          if (auto.packageId && !selectedPackage) setSelectedPackage(auto.packageId);
          if (auto.bodyTypeId && !selectedBodyType) setSelectedBodyType(auto.bodyTypeId);
          if (auto.fuelTypeId && !selectedFuelType) setSelectedFuelType(auto.fuelTypeId);
          if (auto.transmissionTypeId && !selectedTransmission) {
            setSelectedTransmission(auto.transmissionTypeId);
          }
        })
        .catch(console.error);
    }
  }, [
    selectedYear,
    selectedBrand,
    selectedModel,
    selectedVariant,
    selectedPackage,
    selectedBodyType,
    selectedFuelType,
    selectedTransmission,
  ]);

  // Is Step 1 completed?
  const isStep1Complete =
    selectedYear !== '' &&
    selectedBrand !== '' &&
    selectedModel !== '' &&
    (availableVariants.length === 0 || selectedVariant !== '') &&
    (availablePackages.length === 0 || selectedPackage !== '') &&
    (availableBodies.length === 0 || selectedBodyType !== '') &&
    (availableFuels.length === 0 || selectedFuelType !== '') &&
    (availableTransmissions.length === 0 || selectedTransmission !== '');

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
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">
                    <ShinyText text={t('wiz.step1.title')} speed={5} />
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('wiz.step1.desc')}</p>
                </div>
              </div>

              {/* Reset selection button */}
              {(selectedYear || selectedBrand || selectedModel) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYear('');
                    setSelectedBrand('');
                    setModels([]);
                    resetSubordinateOptions();
                  }}
                  className="text-xs text-zinc-400 hover:text-brand-orange flex items-center gap-1 font-semibold transition-all"
                >
                  <X className="w-3.5 h-3.5" /> Temizle
                </button>
              )}
            </div>

            {/* Quick Popular Brand Badges */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-orange" /> Popüler Markalar (Hızlı Seçim)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Audi', 'BMW', 'Mercedes-Benz', 'Volkswagen', 'Fiat', 'Renault', 'Ford', 'Peugeot', 'Toyota', 'Hyundai', 'TOGG', 'Tesla', 'Opel', 'Citroen', 'Skoda'
                ].map((bName) => {
                  const bObj = brands.find((b) => b.name.toLowerCase() === bName.toLowerCase());
                  const isSelected = bObj && selectedBrand === bObj.id;
                  return (
                    <button
                      key={bName}
                      type="button"
                      onClick={() => {
                        if (bObj) {
                          if (!selectedYear) setSelectedYear(2024);
                          setSelectedBrand(bObj.id);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-brand-orange text-white border-brand-orange shadow-md shadow-brand-orange/20 scale-105'
                          : 'bg-zinc-100/80 dark:bg-zinc-900/80 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-brand-orange/40 hover:text-brand-orange'
                      }`}
                    >
                      {bName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Selection Form Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Year Select */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.year')}</label>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value ? Number(e.target.value) : '');
                    setSelectedBrand('');
                    setModels([]);
                    resetSubordinateOptions();
                  }}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                >
                  <option value="">{t('wiz.select')}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand Select */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.brand')}</label>
                <select
                  suppressHydrationWarning
                  disabled={!selectedYear}
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold disabled:opacity-40"
                >
                  <option value="">{t('wiz.select')}</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model Select with Search Input */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.model')}</label>
                  {selectedBrand && models.length > 5 && (
                    <span className="text-[10px] text-zinc-400">{models.length} model listelendi</span>
                  )}
                </div>
                {selectedBrand && models.length > 8 && (
                  <div className="relative mb-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Model Filtrele (Örn: A5 Sedan, Egea, Passat)..."
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      className="glass-input rounded-lg py-2 pl-9 pr-3 text-xs w-full"
                    />
                  </div>
                )}
                <select
                  suppressHydrationWarning
                  disabled={!selectedBrand}
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold disabled:opacity-40"
                >
                  <option value="">{t('wiz.select')}</option>
                  {models
                    .filter((m) => m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Variant Select */}
              {availableVariants.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.variant')}</label>
                  <select
                    value={selectedVariant}
                    onChange={(e) => {
                      setSelectedVariant(e.target.value);
                      setSelectedPackage('');
                      setSelectedBodyType('');
                      setSelectedFuelType('');
                      setSelectedTransmission('');
                    }}
                    className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.horsepower} HP)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Package Select */}
              {availablePackages.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.package')}</label>
                  <select
                    value={selectedPackage}
                    onChange={(e) => {
                      setSelectedPackage(e.target.value);
                      setSelectedBodyType('');
                      setSelectedFuelType('');
                      setSelectedTransmission('');
                    }}
                    className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availablePackages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Body Type Select */}
              {availableBodies.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.body')}</label>
                  <select
                    value={selectedBodyType}
                    onChange={(e) => {
                      setSelectedBodyType(e.target.value);
                      setSelectedFuelType('');
                      setSelectedTransmission('');
                    }}
                    className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableBodies.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Fuel Type Select */}
              {availableFuels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.fuel')}</label>
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
                </div>
              )}

              {/* Transmission Select */}
              {availableTransmissions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.transmission')}</label>
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
                </div>
              )}
            </div>

            {/* Live Vehicle Selection Summary Badge */}
            {(selectedBrand || selectedModel) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-4 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-between flex-wrap gap-2"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-brand-orange" />
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    Seçilen Araç: {selectedYear} {brands.find((b) => b.id === selectedBrand)?.name} {models.find((m) => m.id === selectedModel)?.name}{' '}
                    {availableVariants.find((v) => v.id === selectedVariant)?.name} {availablePackages.find((p) => p.id === selectedPackage)?.name}
                  </span>
                </div>
                {isStep1Complete && (
                  <span className="text-[10px] font-black uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> Seçim Tamamlandı
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
                    {...register('licensePlate', {
                      setValueAs: (v) => v.replace(/\s+/g, '').toUpperCase()
                    })}
                    placeholder="34ABC123"
                    className="glass-input rounded-xl p-3.5 text-sm uppercase"
                  />
                  {errors.licensePlate && (
                    <span className="text-[11px] text-red-500 font-medium">
                      {errors.licensePlate.message}
                    </span>
                  )}
                </div>

                {/* Mileage */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.mileage')}</label>
                  <input
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
                    <span className="text-[11px] text-red-500 font-medium">
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
                    <span className="text-[11px] text-red-500 font-medium">
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
                    <span className="text-[11px] text-red-500 font-medium">
                      {errors.sellingTimeline.message}
                    </span>
                  )}
                </div>

                {/* Soru 2: İstenen Para Miktarı */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-550 dark:text-zinc-400">Bu araç için almak istediğiniz para miktarı nedir? (Zorunlu)</label>
                  <div className="relative">
                    <input
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
                    <span className="text-[11px] text-red-500 font-medium">
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
                  <label className="flex items-start gap-3 cursor-pointer text-xs text-zinc-500 dark:text-zinc-400">
                    <input
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
                    <span className="text-[11px] text-red-500 font-medium">
                      {errors.kvkkAccepted.message as string}
                    </span>
                  )}
                </div>
                
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
                  type="submit"
                  disabled={isLoading || !isEquipmentValid()}
                  className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
                >
                  {isLoading ? (language === 'tr' ? 'Değerlendiriliyor...' : 'Evaluating...') : t('wiz.calculate')}
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 3 && valuationResult && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-8 w-full"
          >
            {/* Header summary */}
            <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-800/10 dark:border-white/5 text-center flex flex-col items-center gap-2">
              <span className="text-[10px] text-brand-orange uppercase font-extrabold tracking-widest bg-brand-orange/10 px-3 py-1 rounded-full border border-brand-orange/20">
                {t('wiz.step3.title')}
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white mt-2">
                {valuationResult.vehicle.year} {valuationResult.vehicle.brand} {valuationResult.vehicle.model}
              </h2>
              <p className="text-xs text-zinc-500">
                {valuationResult.vehicle.variant} - {valuationResult.vehicle.package} -{' '}
                {valuationResult.vehicle.transmission} - {valuationResult.vehicle.fuelType}
              </p>
            </div>

            {/* Valuation Stats Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Main Price display */}
              <div className="md:col-span-2 glass-card rounded-3xl p-6 md:p-8 border border-brand-orange/30 dark:border-brand-orange/20 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-brand-orange/5 via-transparent to-emerald-500/5">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange/10 rounded-bl-[100px] blur-[30px] pointer-events-none" />
                
                {/* 2 MAIN SELLING OPTIONS COMPARISON */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {/* SEÇENEK 1: Anında Nakit Alım */}
                  <div className="p-5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border-2 border-emerald-500/40 relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider mb-2">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        1. Anında Nakit Alım Teklifi
                      </div>
                      <div className="text-3xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-1">
                        {valuationResult.results.finalOfferedPrice.toLocaleString('tr-TR')} ₺
                      </div>
                      {valuationResult.results.userDesiredPrice && valuationResult.results.userDesiredPrice >= 200000 && (
                        <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold mt-1">
                          İstediğiniz Fiyat: {valuationResult.results.userDesiredPrice.toLocaleString('tr-TR')} ₺
                          {valuationResult.results.userDesiredPrice > valuationResult.results.fairMarketValue ? (
                            <span className="text-amber-600 dark:text-amber-400 ml-1 font-bold">(Piyasa Üstü - Galeri Tavan Nakit Teklifi)</span>
                          ) : valuationResult.results.finalOfferedPrice < valuationResult.results.userDesiredPrice ? (
                            <span className="text-amber-600 dark:text-amber-400 ml-1 font-bold">(Yapay Zeka Pazarlık Teklifi)</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1 font-bold">(Talebiniz Kabul Edildi!)</span>
                          )}
                        </div>
                      )}
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mt-2 leading-relaxed">
                        Aracınızı <strong>30 dakikada nakit sizden satın alırız</strong> ve Sahibinden'de direkt kendimiz satarız.
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
                      <div className="text-3xl lg:text-4xl font-black text-brand-orange tracking-tight mt-1">
                        {(valuationResult.results.finalConsignmentPrice || valuationResult.results.maxExpectedValue).toLocaleString('tr-TR')} ₺
                      </div>
                      <p className="text-xs font-semibold text-brand-orange/90 dark:text-orange-200 mt-2 leading-relaxed">
                        Aracınızı dükkanımıza/galerimize emanet bırakırsanız, <strong>sizin adınıza bu fiyata satarız.</strong>
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-brand-orange/20 text-[11px] text-brand-orange font-bold flex items-center gap-1">
                      🏪 Galerimizde sergileme & Yüksek kazanç
                    </div>
                  </div>
                </div>

                {/* Sahibinden Piyasa Kıyaslama Kutuları */}
                <div className="border-t border-zinc-200 dark:border-white/10 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-2xl bg-zinc-100/80 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1">
                      📊 Sahibinden Piyasa Satış Değeri
                    </span>
                    <div className="text-base font-black text-zinc-900 dark:text-white mt-1">
                      {(valuationResult.results.fairMarketValue || Math.round(valuationResult.results.estimatedValue * 1.2)).toLocaleString('tr-TR')} ₺
                    </div>
                    <span className="text-[10px] text-zinc-500">Sahibinden.com benzer araç ilan ortalaması</span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-zinc-100/80 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1">
                      ⚡ Acil Nakit Alım Taban Fiyatı
                    </span>
                    <div className="text-base font-black text-zinc-800 dark:text-zinc-200 mt-1">
                      {valuationResult.results.quickSaleValue.toLocaleString('tr-TR')} ₺
                    </div>
                    <span className="text-[10px] text-zinc-500">En hızlı 15 dakikada nakit alım tabanı</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    <span>{t('wiz.step3.range')}</span>
                    <span className="text-brand-orange font-bold">
                      {valuationResult.results.fairMarketRange}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden relative">
                    <div className="absolute left-[10%] right-[10%] bg-gradient-to-r from-brand-orange to-emerald-500 h-full rounded-full" />
                  </div>
                </div>
              </div>

              {/* Confidence circular indicator card */}
              <div className="glass-card rounded-3xl p-6 border border-zinc-800/10 dark:border-white/5 flex flex-col items-center justify-center text-center gap-4">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="rgba(0,0,0,0.05)"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#ff7a00"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={
                        251.2 - (251.2 * Number(valuationResult.results.confidenceScore.replace('%', ''))) / 100
                      }
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-zinc-900 dark:text-white leading-none">
                      {valuationResult.results.confidenceScore}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mt-1">
                      {t('wiz.step3.confidence')}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-[180px]">
                  {t('wiz.step3.confidence.desc')}
                </p>
              </div>
            </div>


            {/* AI Analysis section */}
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

            {/* Consignment Banner */}
            <div className="bg-gradient-to-r from-brand-orange/15 to-transparent border border-brand-orange/20 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-center gap-6 mt-4">
              <div className="flex flex-col gap-2 text-center md:text-left">
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t('wiz.step3.banner.title')}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xl">
                  {t('wiz.step3.banner.desc')}
                </p>
              </div>

              <Link
                href={`/konsinye?evaluationId=${valuationResult.evaluationId}`}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold text-xs py-3.5 px-6 rounded-xl transition-all hover:shadow-lg hover:shadow-brand-orange/25 shrink-0"
              >
                {t('wiz.step3.banner.btn')}
              </Link>
            </div>

            {/* Reset wizard */}
            <div className="flex items-center justify-center gap-6 mt-6">
              <button
                onClick={() => setStep(2)}
                className="text-xs text-brand-orange hover:underline font-bold cursor-pointer"
              >
                ← Geri Dön (Bilgileri Düzenle)
              </button>
              <span className="text-zinc-500">|</span>
              <button
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
        )}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card max-w-md w-full p-6 md:p-8 border border-zinc-200 dark:border-white/10 rounded-3xl flex flex-col gap-5 relative bg-white dark:bg-zinc-900 shadow-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center border border-brand-orange/20">
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
