'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Car,
  ChevronRight,
  ChevronLeft,
  Shield,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  Mail,
  User,
  MapPin,
  Clock,
  Wrench,
  AlertTriangle,
  Building,
  CheckCircle,
} from 'lucide-react';
import RealisticCarDamageSchematic from '../../components/RealisticCarDamageSchematic';

const API_BASE = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3001/api`
  : 'http://127.0.0.1:3001/api';
import { useLanguage } from '../../context/LanguageContext';

// Validation Schema for Contact Form (Step 6)
const contactSchema = z.object({
  firstName: z
    .string()
    .min(2, 'Ad en az 2 karakter olmalıdır.')
    .regex(/^[a-zA-ZÇŞĞÜÖİçşğüöı ]+$/, 'Ad sadece harflerden oluşmalıdır.'),
  lastName: z
    .string()
    .min(2, 'Soyad en az 2 karakter olmalıdır.')
    .regex(/^[a-zA-ZÇŞĞÜÖİçşğüöı ]+$/, 'Soyad sadece harflerden oluşmalıdır.'),
  phone: z
    .string()
    .regex(/^(05|5)\d{9}$/, 'Lütfen geçerli bir TR telefon numarası giriniz (örn: 05xx xxx xx xx).'),
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
  province: z.string().min(1, 'Lütfen bir şehir seçiniz.'),
  district: z.string().min(2, 'İlçe en az 2 karakter olmalıdır.'),
  preferredContact: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']),
  kvkkAccepted: z.boolean().refine((val) => val === true, {
    message: 'Devam etmek için KVKK Aydınlatma Metni\'ni onaylamanız gerekmektedir.',
  }),
});

const trProvinces = [
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Amasya', 'Ankara', 'Antalya', 'Artvin',
  'Aydın', 'Balıkesir', 'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa',
  'Çanakkale', 'Çankırı', 'Çorum', 'Denizli', 'Diyarbakır', 'Edirne', 'Elazığ', 'Erzincan',
  'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkari', 'Hatay', 'Isparta',
  'Mersin', 'İstanbul', 'İzmir', 'Kars', 'Kastamonu', 'Kayseri', 'Kırklareli', 'Kırşehir',
  'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa', 'Kahramanmaraş', 'Mardin', 'Muğla',
  'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Rize', 'Sakarya', 'Samsun', 'Siirt',
  'Sinop', 'Sivas', 'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Şanlıurfa', 'Uşak',
  'Van', 'Yozgat', 'Zonguldak', 'Aksaray', 'Bayburt', 'Karaman', 'Kırıkkale', 'Batman',
  'Şırnak', 'Bartın', 'Ardahan', 'Iğdır', 'Yalova', 'Karabük', 'Kilis', 'Osmaniye',
  'Düzce'
];

const carParts = [
  'Sol Ön Çamurluk', 'Sol Ön Kapı', 'Sol Arka Kapı', 'Sol Arka Çamurluk',
  'Arka Tampon', 'Bagaj', 'Sağ Arka Çamurluk', 'Sağ Arka Kapı',
  'Sağ Ön Kapı', 'Sağ Ön Çamurluk', 'Ön Tampon', 'Motor Kaputu', 'Tavan'
];

function ConsignmentContent() {
  const { t, language } = useLanguage();
  const searchParams = useSearchParams();
  const evaluationId = searchParams.get('evaluationId');

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [prePopulatedVehicle, setPrePopulatedVehicle] = useState<any>(null);

  // Taxonomy states (if no evaluationId is provided)
  const [years, setYears] = useState<number[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);

  const [selectedYear, setSelectedYear] = useState<number | ''>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const [selectedPackage, setSelectedPackage] = useState<string>('');
  const [selectedBodyType, setSelectedBodyType] = useState<string>('');
  const [selectedFuelType, setSelectedFuelType] = useState<string>('');
  const [selectedTransmission, setSelectedTransmission] = useState<string>('');

  const [availableVariants, setAvailableVariants] = useState<any[]>([]);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [availableBodies, setAvailableBodies] = useState<any[]>([]);
  const [availableFuels, setAvailableFuels] = useState<any[]>([]);
  const [availableTransmissions, setAvailableTransmissions] = useState<any[]>([]);

  // APPRAISAL STATE VARIABLES (Photo 1, 2, 3, 5)
  // Step 2: Paint & Damage Mapping
  const [paintScheme, setPaintScheme] = useState<Record<string, 'ORIJINAL' | 'LOKAL' | 'BOYALI' | 'DEGISEN'>>(
    carParts.reduce((acc, part) => ({ ...acc, [part]: 'ORIJINAL' }), {})
  );
  const [noDamageChecked, setNoDamageChecked] = useState(true);

  // Step 3: Chassis Info
  const [chassisState, setChassisState] = useState<Record<string, boolean>>({
    'Sol Ön Şasi': false,
    'Sağ Ön Şasi': false,
    'Sol Arka Şasi': false,
    'Sağ Arka Şasi': false
  });

  // Step 4: Equipments & Features
  const [sunroof, setSunroof] = useState(false);
  const [panoramikTavan, setPanoramikTavan] = useState(false);
  const [camTavan, setCamTavan] = useState(false);
  const [otherFeatures, setOtherFeatures] = useState('');

  // Step 5: Mechanical & Status Details
  const [drivetrain, setDrivetrain] = useState('Önden Çekiş');
  const [crackedGlass, setCrackedGlass] = useState(false);
  const [scratchOrDent, setScratchOrDent] = useState(false);
  const [hasExpertReport, setHasExpertReport] = useState(false);
  const [heavyDamage, setHeavyDamage] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  const [spareKey, setSpareKey] = useState(true);
  const [salesBarrier, setSalesBarrier] = useState(false);
  const [importExport, setImportExport] = useState('Yerli');
  const [maintenanceYear, setMaintenanceYear] = useState(2024);
  const [maintenanceMonth, setMaintenanceMonth] = useState('Haziran');
  const [maintenancePlace, setMaintenancePlace] = useState('');
  const [inspectionDay, setInspectionDay] = useState(15);
  const [inspectionMonth, setInspectionMonth] = useState('Ocak');
  const [inspectionYear, setInspectionYear] = useState(2026);
  const [videoLink, setVideoLink] = useState('');

  // Successful submission result
  const [successResult, setSuccessResult] = useState<any>(null);
  const [showKvkk, setShowKvkk] = useState(false);

  // Zod form binding
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      province: '',
      district: '',
      preferredContact: 'WHATSAPP' as const,
      kvkkAccepted: false,
    },
  });

  // Fetch pre-populated valuation if evaluationId is present
  useEffect(() => {
    if (evaluationId) {
      setIsLoading(true);
      fetch(`${API_BASE}/vehicle-evaluation/${evaluationId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Değerleme bulunamadı.');
          return res.json();
        })
        .then((data) => {
          setPrePopulatedVehicle(data);
          setStep(2); // Skip Step 1 selection, go directly to Paint/Appraisal Steps
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    } else {
      fetch(`${API_BASE}/years`).then((res) => res.json()).then(setYears).catch(console.error);
      fetch(`${API_BASE}/brands`).then((res) => res.json()).then(setBrands).catch(console.error);
    }
  }, [evaluationId]);

  // Load models on brand selection
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
          setSelectedModel('');
          resetSubordinateFields();
        })
        .catch(console.error);
    } else {
      setModels([]);
    }
  }, [selectedBrand]);

  const resetSubordinateFields = () => {
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

  // Fetch dynamic selections for remainder fields
  useEffect(() => {
    if (selectedYear && selectedBrand && selectedModel) {
      const q = new URLSearchParams({
        year: String(selectedYear),
        manufacturerId: selectedBrand,
        modelId: selectedModel,
      });
      if (selectedVariant) q.append('variantId', selectedVariant);
      if (selectedPackage) q.append('packageId', selectedPackage);
      if (selectedBodyType) q.append('bodyTypeId', selectedBodyType);
      if (selectedFuelType) q.append('fuelTypeId', selectedFuelType);
      if (selectedTransmission) q.append('transmissionTypeId', selectedTransmission);

      fetch(`${API_BASE}/vehicle-data?${q.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setAvailableVariants(data.variants || []);
          setAvailablePackages(data.packages || []);
          setAvailableBodies(data.bodyTypes || []);
          setAvailableFuels(data.fuelTypes || []);
          setAvailableTransmissions(data.transmissionTypes || []);

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

  const isStep1Complete =
    selectedYear !== '' &&
    selectedBrand !== '' &&
    selectedModel !== '' &&
    (availableVariants.length === 0 || selectedVariant !== '') &&
    (availablePackages.length === 0 || selectedPackage !== '') &&
    (availableBodies.length === 0 || selectedBodyType !== '') &&
    (availableFuels.length === 0 || selectedFuelType !== '') &&
    (availableTransmissions.length === 0 || selectedTransmission !== '');

  const updatePaintPart = (part: string, status: 'ORIJINAL' | 'LOKAL' | 'BOYALI' | 'DEGISEN') => {
    setPaintScheme(prev => {
      const next = { ...prev, [part]: status };
      // If any part is not original, uncheck "no damage" checkbox
      if (status !== 'ORIJINAL') {
        setNoDamageChecked(false);
      }
      return next;
    });
  };

  const setAllOriginal = (checked: boolean) => {
    setNoDamageChecked(checked);
    if (checked) {
      setPaintScheme(carParts.reduce((acc, part) => ({ ...acc, [part]: 'ORIJINAL' }), {}));
    }
  };

  const handleFormSubmit = async (formData: any) => {
    setIsLoading(true);
    try {
      // Package detailed appraisal data
      const equipmentsObj = { sunroof, panoramikTavan, camTavan, otherFeatures };
      const vehicleStatusObj = {
        drivetrain, crackedGlass, scratchOrDent, hasExpertReport, heavyDamage,
        isOwner, spareKey, salesBarrier, importExport, maintenanceYear,
        maintenanceMonth, maintenancePlace, inspectionDay, inspectionMonth,
        inspectionYear, videoLink
      };

      const payload = {
        vehicleEvaluationId: evaluationId || null,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        email: formData.email,
        province: formData.province,
        district: formData.district,
        preferredContact: formData.preferredContact,

        // If not pre-populated, pass vehicle specs to run evaluation on-the-fly!
        year: prePopulatedVehicle?.vehicle?.year || Number(selectedYear),
        manufacturerId: prePopulatedVehicle?.vehicle?.manufacturerId || selectedBrand,
        modelId: prePopulatedVehicle?.vehicle?.modelId || selectedModel,
        variantId: prePopulatedVehicle?.vehicle?.variantId || selectedVariant,
        packageId: prePopulatedVehicle?.vehicle?.packageId || selectedPackage || '',
        bodyTypeId: prePopulatedVehicle?.vehicle?.bodyTypeId || selectedBodyType,
        fuelTypeId: prePopulatedVehicle?.vehicle?.fuelTypeId || selectedFuelType,
        transmissionTypeId: prePopulatedVehicle?.vehicle?.transmissionTypeId || selectedTransmission,
        mileage: prePopulatedVehicle?.mileage || 100000,
        color: prePopulatedVehicle?.color || 'Beyaz',

        // Appraisal objects (stringified JSONs for backend parsing)
        paintScheme: JSON.stringify(paintScheme),
        chassisState: JSON.stringify(chassisState),
        equipments: JSON.stringify(equipmentsObj),
        vehicleStatus: JSON.stringify(vehicleStatusObj),
        notes: JSON.stringify({ paintScheme, chassisState, equipmentsObj, vehicleStatusObj })
      };

      const response = await fetch(`${API_BASE}/consignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Konsinye başvurusu alınamadı.');
      }

      const result = await response.json();
      setSuccessResult(result);
      setStep(7); // success page
    } catch (err: any) {
      alert(err.message || 'Bir hata oluştu, lütfen daha sonra tekrar deneyiniz.');
    } finally {
      setIsLoading(false);
    }
  };

  // Highlight color helper for visual car schema
  const getPartColor = (status: string) => {
    switch (status) {
      case 'DEGISEN': return 'fill-red-500/80 stroke-red-600';
      case 'BOYALI': return 'fill-amber-400/80 stroke-amber-500';
      case 'LOKAL': return 'fill-yellow-200/80 stroke-yellow-400';
      default: return 'fill-zinc-100 dark:fill-zinc-800/40 stroke-zinc-300 dark:stroke-zinc-700';
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full px-4 md:px-8 py-10 md:py-16 flex-1 flex flex-col justify-center">
      {/* Progress Circles */}
      <div className="flex items-center justify-between mb-8 max-w-lg mx-auto w-full">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              disabled={s >= step}
              onClick={() => {
                if (s < step) setStep(s);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border transition-all ${
                step >= s
                  ? 'bg-brand-orange text-white border-brand-orange shadow-lg shadow-brand-orange/20'
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              } ${s < step ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
            >
              {s}
            </button>
            {s < 6 && (
              <div
                className={`h-0.5 flex-grow mx-1.5 transition-all ${
                  step > s ? 'bg-brand-orange' : 'bg-zinc-800'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Specs Selection (only if no evaluationId provided) */}
        {step === 1 && (
          <motion.div
            key="step1-cons"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">
                  {language === 'tr' ? 'Konsinye Araç Seçimi' : 'Consignment Vehicle Select'}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {language === 'tr' ? 'Lütfen aracınızın temel özelliklerini seçin.' : 'Please choose your vehicle specifications.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.year')}</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="glass-input rounded-xl p-3.5 text-sm w-full"
                >
                  <option value="">{t('wiz.select')}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.brand')}</label>
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-sm w-full"
                >
                  <option value="">{t('wiz.select')}</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {models.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.model')}</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableVariants.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availablePackages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

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
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableBodies.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {availableFuels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.fuel')}</label>
                  <select
                    value={selectedFuelType}
                    onChange={(e) => {
                      setSelectedFuelType(e.target.value);
                      setSelectedTransmission('');
                    }}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableFuels.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {availableTransmissions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.transmission')}</label>
                  <select
                    value={selectedTransmission}
                    onChange={(e) => setSelectedTransmission(e.target.value)}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">{t('wiz.select')}</option>
                    {availableTransmissions.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                disabled={!isStep1Complete}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                {t('wiz.next')}
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Paint & Damage Mapping (Photo 1) */}
        {step === 2 && (
          <motion.div
            key="step2-appraisal"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">Boya ve Değişen Parça Şeması</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Aracınızdaki hasarlı, boyalı veya değişen parçaları şema üzerinden seçin.</p>
              </div>
            </div>

            {/* Checkbox: No damage */}
            <div className="bg-brand-orange/5 border border-brand-orange/10 p-4 rounded-xl flex items-center gap-3">
              <input
                type="checkbox"
                id="noDamage"
                checked={noDamageChecked}
                onChange={(e) => setAllOriginal(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-800 text-brand-orange focus:ring-brand-orange w-4 h-4 bg-white dark:bg-zinc-950"
              />
              <label htmlFor="noDamage" className="text-xs font-bold text-zinc-700 dark:text-zinc-200 cursor-pointer select-none">
                Aracımın boyanan ya da değişen parçası yok (Tamamen Orijinal)
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Side: Table input */}
              <div className="lg:col-span-7 overflow-x-auto max-h-[480px] overflow-y-auto pr-2">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="py-2.5 font-bold text-zinc-500">Parça</th>
                      <th className="py-2.5 text-center font-bold text-zinc-500">Orijinal</th>
                      <th className="py-2.5 text-center font-bold text-zinc-500">Lokal</th>
                      <th className="py-2.5 text-center font-bold text-zinc-500">Boyalı</th>
                      <th className="py-2.5 text-center font-bold text-zinc-500">Değişen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carParts.map((part) => (
                      <tr key={part} className="border-b border-zinc-100 dark:border-zinc-800/30 hover:bg-zinc-50/50 dark:hover:bg-white/2">
                        <td className="py-2.5 font-semibold text-zinc-850 dark:text-zinc-300">{part}</td>
                        <td className="py-2.5 text-center">
                          <input
                            type="radio"
                            name={`paint-${part}`}
                            checked={paintScheme[part] === 'ORIJINAL'}
                            onChange={() => updatePaintPart(part, 'ORIJINAL')}
                            className="text-brand-orange focus:ring-brand-orange w-3.5 h-3.5"
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <input
                            type="radio"
                            name={`paint-${part}`}
                            checked={paintScheme[part] === 'LOKAL'}
                            onChange={() => updatePaintPart(part, 'LOKAL')}
                            className="text-brand-orange focus:ring-brand-orange w-3.5 h-3.5"
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <input
                            type="radio"
                            name={`paint-${part}`}
                            checked={paintScheme[part] === 'BOYALI'}
                            onChange={() => updatePaintPart(part, 'BOYALI')}
                            className="text-brand-orange focus:ring-brand-orange w-3.5 h-3.5"
                          />
                        </td>
                        <td className="py-2.5 text-center">
                          <input
                            type="radio"
                            name={`paint-${part}`}
                            checked={paintScheme[part] === 'DEGISEN'}
                            onChange={() => updatePaintPart(part, 'DEGISEN')}
                            className="text-brand-orange focus:ring-brand-orange w-3.5 h-3.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Right Side: Interactive Real Image Car Schematic */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center">
                <RealisticCarDamageSchematic
                  paintScheme={paintScheme}
                  interactive={true}
                  onPartClick={(partName) => {
                    const current = paintScheme[partName] || 'ORIJINAL';
                    const nextMap: Record<string, 'ORIJINAL' | 'LOKAL' | 'BOYALI' | 'DEGISEN'> = {
                      ORIJINAL: 'BOYALI',
                      BOYALI: 'LOKAL',
                      LOKAL: 'DEGISEN',
                      DEGISEN: 'ORIJINAL',
                    };
                    updatePaintPart(partName, nextMap[current] || 'ORIJINAL');
                  }}
                />
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(evaluationId ? 2 : 1)} // if pre-populated can't go to 1
                disabled={!!evaluationId}
                className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" /> Geri
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                Devam Et <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Chassis Info (Photo 2) */}
        {step === 3 && (
          <motion.div
            key="step3-chassis"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">Şasi Bilgisi</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Aracın şasilerinde herhangi bir işlem veya hasar olup olmadığını belirtin.</p>
              </div>
            </div>

            <div className="flex flex-col gap-6 mt-4 max-w-2xl mx-auto w-full">
              {['Sol Ön Şasi', 'Sağ Ön Şasi', 'Sol Arka Şasi', 'Sağ Arka Şasi'].map((part) => (
                <div key={part} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-50/50 dark:bg-white/2 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <span className="font-extrabold text-sm text-zinc-800 dark:text-white">{part}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setChassisState(prev => ({ ...prev, [part]: false }))}
                      className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        chassisState[part] === false
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                    >
                      İşlem Yok
                    </button>
                    <button
                      type="button"
                      onClick={() => setChassisState(prev => ({ ...prev, [part]: true }))}
                      className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        chassisState[part] === true
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/10'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                    >
                      İşlem Var
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" /> Geri
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                Devam Et <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 4: Equipments & Features (Photo 3) */}
        {step === 4 && (
          <motion.div
            key="step4-equipments"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">Popüler Donanımlar ve Özellikler</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Aracınızın popüler donanımlarını seçin veya ekstra özellikleri yazın.</p>
              </div>
            </div>

            <div className="flex flex-col gap-6 mt-4">
              {/* Popular Equipments grid */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-2">Popüler Donanımlar</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { label: 'Sunroof', state: sunroof, setState: setSunroof },
                    { label: 'Panoramik Tavan', state: panoramikTavan, setState: setPanoramikTavan },
                    { label: 'Cam Tavan', state: camTavan, setState: setCamTavan }
                  ].map((item) => (
                    <label
                      key={item.label}
                      className={`flex items-center gap-3 p-4 rounded-xl border text-sm font-bold cursor-pointer transition-all ${
                        item.state
                          ? 'bg-brand-orange/10 border-brand-orange/40 text-brand-orange'
                          : 'bg-zinc-50/50 dark:bg-white/2 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.state}
                        onChange={(e) => item.setState(e.target.checked)}
                        className="rounded border-zinc-300 dark:border-zinc-800 text-brand-orange focus:ring-brand-orange w-4 h-4 bg-white dark:bg-zinc-950"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Other Specs textarea */}
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Diğer Özellikler</label>
                <textarea
                  value={otherFeatures}
                  onChange={(e) => setOtherFeatures(e.target.value)}
                  placeholder="Diğer özelliklerinizi buraya yazabilirsiniz... (Örn: LED farlar, deri koltuklar, geri görüş kamerası, adaptif hız sabitleyici, ön-arka park sensörü vb.)"
                  className="glass-input rounded-2xl p-4 text-sm w-full min-h-[140px] leading-relaxed resize-none"
                />
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Her özelliği virgül ile ayırarak yazabilirsiniz.</span>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" /> Geri
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                Devam Et <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 5: Vehicle Status & Mechanics (Photo 5) */}
        {step === 5 && (
          <motion.div
            key="step5-status"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">Araç Durumu</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Aracınızın detaylı mekanik durumunu, bakım ve tescil geçmişini belirtin.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* Çekiş Sistemi */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Çekiş Sistemi *</label>
                <select
                  value={drivetrain}
                  onChange={(e) => setDrivetrain(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                >
                  <option value="Önden Çekiş">Önden Çekiş</option>
                  <option value="Arkadan İtiş">Arkadan İtiş</option>
                  <option value="4x4 / AWD">4x4 / AWD</option>
                </select>
              </div>

              {/* İthal/İhraç Durumu */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">İthal/İhraç Durumu</label>
                <select
                  value={importExport}
                  onChange={(e) => setImportExport(e.target.value)}
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                >
                  <option value="Yerli">Yerli / Bayi Çıkışlı</option>
                  <option value="İthal">İthal / Gümrük Girişli</option>
                </select>
              </div>

              {/* Checkboxes grid */}
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">Genel Durum Seçenekleri</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {[
                    { label: 'Camda kırık var', state: crackedGlass, setState: setCrackedGlass },
                    { label: 'Ezik, çizik veya göçük var', state: scratchOrDent, setState: setScratchOrDent },
                    { label: 'Ekspertiz raporu var', state: hasExpertReport, setState: setHasExpertReport },
                    { label: 'Ağır hasar kaydı var', state: heavyDamage, setState: setHeavyDamage },
                    { label: 'Ruhsat sahibiyim', state: isOwner, setState: setIsOwner },
                    { label: 'Yedek anahtar var', state: spareKey, setState: setSpareKey },
                    { label: 'Satış engeli var', state: salesBarrier, setState: setSalesBarrier }
                  ].map((item) => (
                    <label key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-50/50 dark:bg-white/2 border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.state}
                        onChange={(e) => item.setState(e.target.checked)}
                        className="rounded border-zinc-300 dark:border-zinc-800 text-brand-orange focus:ring-brand-orange w-4 h-4 bg-white dark:bg-zinc-950"
                      />
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Son Bakım Bilgileri */}
              <div className="flex flex-col gap-2 md:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-2">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Son Bakım Bilgileri</label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Son Bakım Yılı</span>
                    <input
                      type="number"
                      value={maintenanceYear}
                      onChange={(e) => setMaintenanceYear(Number(e.target.value))}
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Son Bakım Ayı</span>
                    <select
                      value={maintenanceMonth}
                      onChange={(e) => setMaintenanceMonth(e.target.value)}
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    >
                      {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Son Bakım Yeri</span>
                    <input
                      type="text"
                      value={maintenancePlace}
                      onChange={(e) => setMaintenancePlace(e.target.value)}
                      placeholder="Örn: Yetkili Servis"
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Muayene Bitiş Tarihi */}
              <div className="flex flex-col gap-2 md:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Muayene Bitiş Tarihi</label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Gün</span>
                    <select
                      value={inspectionDay}
                      onChange={(e) => setInspectionDay(Number(e.target.value))}
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Ay</span>
                    <select
                      value={inspectionMonth}
                      onChange={(e) => setInspectionMonth(e.target.value)}
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    >
                      {['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400">Yıl</span>
                    <select
                      value={inspectionYear}
                      onChange={(e) => setInspectionYear(Number(e.target.value))}
                      className="glass-input rounded-xl p-3.5 text-xs font-semibold"
                    >
                      {[2024, 2025, 2026, 2027, 2028, 2029].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Video Linki */}
              <div className="flex flex-col gap-2 md:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Video Linki (Opsiyonel)</label>
                <input
                  type="text"
                  value={videoLink}
                  onChange={(e) => setVideoLink(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="glass-input rounded-xl p-3.5 text-sm w-full"
                />
                <span className="text-[10px] text-zinc-400">YouTube, Vimeo veya başka bir video platformu linki ekleyebilirsiniz.</span>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" /> Geri
              </button>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="inline-flex items-center gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
              >
                Devam Et <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 6: Contact Info (Photo 4) */}
        {step === 6 && (
          <motion.div
            key="step6-contact"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass-card rounded-3xl p-6 md:p-10 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-orange/10 flex items-center justify-center text-brand-orange border border-brand-orange/20">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">İletişim Bilgileriniz</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Sizinle iletişime geçebilmemiz için bilgilerinizi girin.</p>
              </div>
            </div>

            {/* Prepopulated Info Panel */}
            {prePopulatedVehicle && (
              <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <span className="text-[10px] text-brand-orange font-bold uppercase tracking-wider bg-brand-orange/15 px-2.5 py-0.5 rounded-full">
                    {t('con.details')}
                  </span>
                  <h4 className="font-extrabold text-sm text-zinc-800 dark:text-white mt-1.5">
                    {prePopulatedVehicle.vehicle.year} {prePopulatedVehicle.vehicle.brand} {prePopulatedVehicle.vehicle.model}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {prePopulatedVehicle.vehicle.variant} - {prePopulatedVehicle.vehicle.package}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-zinc-400 block">{t('wiz.step3.fair')}</span>
                  <span className="font-black text-brand-orange text-lg">
                    {prePopulatedVehicle.results.estimatedValue.toLocaleString('tr-TR')} ₺
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Ad *</label>
                  <input
                    type="text"
                    {...register('firstName')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                      const formatted = raw.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                      setValue('firstName', formatted, { shouldValidate: true });
                    }}
                    placeholder="Adınızı girin"
                    className="glass-input rounded-xl p-3.5 text-sm font-semibold"
                  />
                  {errors.firstName && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.firstName.message}</span>
                  )}
                </div>

                {/* Last Name */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Soyad *</label>
                  <input
                    type="text"
                    {...register('lastName')}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^a-zA-ZÇŞĞÜÖİçşğüöı\s]/g, '');
                      const formatted = raw.split(' ').map(w => w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : '').join(' ');
                      setValue('lastName', formatted, { shouldValidate: true });
                    }}
                    placeholder="Soyadınızı girin"
                    className="glass-input rounded-xl p-3.5 text-sm font-semibold"
                  />
                  {errors.lastName && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.lastName.message}</span>
                  )}
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Telefon *</label>
                  <input
                    type="tel"
                    {...register('phone')}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setValue('phone', digits);
                    }}
                    maxLength={11}
                    placeholder="05xx xxx xx xx"
                    className="glass-input rounded-xl p-3.5 text-sm"
                  />
                  {errors.phone && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.phone.message}</span>
                  )}
                </div>

                {/* Email */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">E-posta adresi *</label>
                  <input
                    type="email"
                    {...register('email')}
                    placeholder="ornek@email.com"
                    className="glass-input rounded-xl p-3.5 text-sm"
                  />
                  {errors.email && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.email.message}</span>
                  )}
                </div>

                {/* City select */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">İl *</label>
                  <select
                    {...register('province')}
                    className="glass-input rounded-xl p-3.5 text-sm w-full"
                  >
                    <option value="">İl Seçiniz</option>
                    {trProvinces.map((prov) => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                  {errors.province && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.province.message}</span>
                  )}
                </div>

                {/* District text */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">İlçe *</label>
                  <input
                    {...register('district')}
                    placeholder="İlçe Seçiniz"
                    className="glass-input rounded-xl p-3.5 text-sm"
                  />
                  {errors.district && (
                    <span className="text-[11px] text-red-500 font-medium">{errors.district.message}</span>
                  )}
                </div>

                {/* Preferred Contact method */}
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('con.preferred')}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { val: 'WHATSAPP', label: 'WhatsApp', icon: Sparkles },
                      { val: 'PHONE', label: language === 'tr' ? 'Telefon Arama' : 'Phone Call', icon: PhoneCall },
                      { val: 'EMAIL', label: language === 'tr' ? 'E-posta Gönderimi' : 'Email Message', icon: Mail },
                    ].map((item) => (
                      <label
                        key={item.val}
                        className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          watch('preferredContact') === item.val
                            ? 'bg-brand-orange/15 border-brand-orange text-brand-orange'
                            : 'bg-zinc-100/60 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="radio"
                          value={item.val}
                          {...register('preferredContact')}
                          className="hidden"
                        />
                        {item.label}
                      </label>
                    ))}
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
                        className="text-brand-orange hover:underline font-bold mr-1 inline cursor-pointer"
                      >
                        {t('wiz.kvkk.link')}
                      </button>
                      {language === 'tr'
                        ? 'kapsamında araç verilerimin ve iletişim bilgilerimin konsinye başvuru amaçlı işlenmesini ve kaydedilmesini kabul ediyorum.'
                        : 'I accept the processing and storing of my vehicle details and contact info for consignment purposes.'}
                    </span>
                  </label>
                  {errors.kvkkAccepted && (
                    <span className="text-[11px] text-red-500 font-medium">
                      {errors.kvkkAccepted.message as string}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 font-bold py-3.5 px-6 rounded-xl transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" /> Geri
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center justify-center gap-2 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-40 text-white font-bold py-3.5 px-8 rounded-xl transition-all duration-300 cursor-pointer"
                >
                  {isLoading ? (language === 'tr' ? 'Gönderiliyor...' : 'Submitting...') : 'DEVAM ➔'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Step 7: Success Result */}
        {step === 7 && successResult && (
          <motion.div
            key="step7-success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-3xl p-8 md:p-12 border border-zinc-800/10 dark:border-white/5 text-center flex flex-col items-center gap-6"
          >
            <div className="w-16 h-16 rounded-full bg-brand-orange/15 flex items-center justify-center text-brand-orange border border-brand-orange/20 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white">{t('con.success')}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed mt-2">
                {language === 'tr' ? (
                  <>
                    Sayın <span className="text-zinc-800 dark:text-white font-semibold">{successResult.consignment.firstName} {successResult.consignment.lastName}</span>, 
                    başvurunuz CRM sistemimize <span className="text-zinc-850 dark:text-white font-semibold">{successResult.consignmentId.substring(0, 8)}</span> takip numarası ile kaydedilmiştir.
                  </>
                ) : (
                  <>
                    Dear <span className="text-zinc-800 dark:text-white font-semibold">{successResult.consignment.firstName} {successResult.consignment.lastName}</span>, 
                    your application has been registered in our CRM system with tracking number <span className="text-zinc-855 dark:text-white font-semibold">{successResult.consignmentId.substring(0, 8)}</span>.
                  </>
                )}
              </p>
            </div>

            <div className="bg-zinc-100/60 dark:bg-white/3 border border-zinc-200 dark:border-white/5 rounded-2xl p-6 w-full max-w-md flex flex-col gap-4 text-left">
              <h4 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest border-b border-zinc-200 dark:border-white/5 pb-2.5">
                {language === 'tr' ? 'Başvuru Özetiniz' : 'Application Summary'}
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-zinc-500 block">{language === 'tr' ? 'Şehir / İlçe' : 'Province / District'}</span>
                  <span className="text-zinc-855 dark:text-zinc-300 font-semibold mt-0.5 block">
                    {successResult.consignment.province} / {successResult.consignment.district}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">{language === 'tr' ? 'İletişim Kanalı' : 'Contact Channel'}</span>
                  <span className="text-brand-orange font-semibold mt-0.5 block">
                    {successResult.consignment.preferredContact}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-500 block">{language === 'tr' ? 'İletişim Telefon' : 'Contact Phone'}</span>
                  <span className="text-zinc-855 dark:text-zinc-300 mt-0.5 block font-mono">
                    {successResult.consignment.phone}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-4 w-full max-w-xs">
              <button
                onClick={() => {
                  setStep(1);
                  setSuccessResult(null);
                  setPrePopulatedVehicle(null);
                  setSelectedYear('');
                  setSelectedBrand('');
                  setSelectedModel('');
                  resetSubordinateFields();
                }}
                className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold py-3.5 px-6 rounded-xl text-sm transition-all cursor-pointer"
              >
                {language === 'tr' ? 'Yeni Başvuru Yap' : 'New Application'}
              </button>
              <a
                href="/"
                className="text-xs text-zinc-500 hover:text-zinc-300 underline font-medium py-2"
              >
                {t('con.success.home')}
              </a>
            </div>
          </motion.div>
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
    </div>
  );
}

export default function ConsignmentWizard() {
  return (
    <Suspense fallback={<div className="text-center py-20">Yükleniyor...</div>}>
      <ConsignmentContent />
    </Suspense>
  );
}
