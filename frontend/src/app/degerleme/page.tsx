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
import { formatTL } from '../../lib/format';
import { siteConfig } from '../../config/site-config';
import { telHref } from '../../lib/contact';

/**
 * MUSTERIYE GOSTERILECEK ACIKLAMALARI SUZ.
 *
 * Arka ucun `aiAnalysis` listesi hem musteriye uygun cumleler hem de DAHILI
 * teknik/galeri-ici satirlar tasir. Ham haliyle basildiginda musteri sunlari
 * goruyordu (olculdu):
 *   - "Seviye 1: ... birebir motor, yakit ve model yili eslesen 9 gercek
 *     Sahibinden ilani kullanildi"              -> ic eslesme seviyesi
 *   - "... (LEARNED_FROM_LISTINGS)"             -> ham ic enum
 *   - "Kilometre Duzeltmesi: ... Katsayi: %1.66/10.000km ..." -> ic katsayi
 *   - "Bu arac icin otomatik fiyatlandirma guvenli aralikta sonuc uretemedi"
 *     -> GALERI ICI ekonomi gerekcesi (musteri tabani/kar catismasi)
 *
 * Bu satirlar KALDIRILIR. Yerine uydurma metin URETILMEZ; yalnizca zaten
 * musteri diliyle yazilmis satirlar gecer. Arka uc DEGISMEDI.
 */
const INTERNAL_NOTE_PATTERNS: RegExp[] = [
  /Seviye\s*\d/i,                       // ic eslesme seviyesi
  /LEARNED_|DEFAULT_|SNAPSHOT_|NO_KM_DATA|LIMITED_KM_SAMPLE/,  // ham enum
  /Kilometre Düzeltmesi:/i,             // ic katsayi dokumu
  /Model Yılı Normalizasyonu:/i,        // ic normalizasyon dokumu
  /güvenli aralıkta sonuç üretemedi/i,  // galeri ici ekonomi gerekcesi
  /Fiyat invariantları/i,               // ic tutarlilik kontrolu
  /konsinye komisyonu.*kurgulanamıyor/i, // galeri ici komisyon gerekcesi
];

/**
 * MANUEL GEREKCESINI MUSTERI DILINE CEVIR.
 *
 * Ic gerekceler (dusuk guven, musteri tabani catismasi, kar/ekonomi
 * catismasi, TRAMER_RATIO_HIGH gibi bayraklar) MUSTERIYE GOSTERILMEZ.
 * Yalnizca musterinin anlayabilecegi ve dogru olan bir ozet secilir.
 * Hicbir gerekce uydurulmaz; eslesme yoksa notr metin doner.
 */
const manualReasonForCustomer = (notes: unknown): string => {
  const text = Array.isArray(notes) ? notes.filter((n) => typeof n === 'string').join(' | ') : '';
  if (/yapısal\/ağır hasar|mekanik arıza|çok sayıda değişen panel/i.test(text)) {
    return 'Aracınızda bildirdiğiniz hasar/onarım durumu, yerinde kontrol ile daha doğru değerlenir.';
  }
  if (/hasar seviyesi otomatik fiyatlandırma için yüksek/i.test(text)) {
    return 'Bildirdiğiniz hasar geçmişi nedeniyle ek inceleme gerekiyor.';
  }
  if (/sınırlı sayıda emsal/i.test(text)) {
    return 'Aracınıza çok benzeyen ilan sayısı sınırlı olduğu için fiyatı uzmanımız netleştirecek.';
  }
  if (/kasa tipi belirtilmediği/i.test(text)) {
    return 'Aracınızın kasa tipi netleşmediği için doğru fiyat uzmanımızca belirlenecek.';
  }
  return 'Aracınızın özellikleri, otomatik teklif yerine uzman değerlendirmesini daha sağlıklı kılıyor.';
};

const customerFacingNotes = (notes: unknown): string[] => {
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .filter((n) => !INTERNAL_NOTE_PATTERNS.some((re) => re.test(n)));
};

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
  // Sessizlik "aracim temiz" beyani DEGILDIR: kullanici acikca secmek zorunda.
  damageStatus: z.enum(['YES', 'NO', 'UNKNOWN'], {
    message: 'Lütfen aracınızın boya/değişen durumunu belirtiniz. Emin değilseniz "Bilmiyorum" seçebilirsiniz.',
  }),
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

import { API_BASE } from '@/lib/api';
import VehicleHierarchyWizard, { HierarchyNode } from '@/components/VehicleHierarchyWizard';

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

const filterDirtyOptions = (options: any[]) => {
  return options.filter((opt) => {
    if (!opt || typeof opt.name !== 'string') return false;
    const name = opt.name.toLowerCase();
    if (name === '' || name === '-' || name === '--') return false;
    if (name.includes('sahibinden') || name.includes('.html') || name.includes('.htm') || name.includes('fiyatları & modelleri')) return false;
    if (/-\s*\d+$/.test(name)) return false;
    return true;
  });
};

// Tek kaynak: hem submit doğrulaması hem de alan altındaki yardım metni bunu kullanır.
const TR_PHONE_PATTERN = /^(05|5)\d{9}$/;

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
  /**
   * URETIM ARAC SECIMI: kaynagin GERCEK kategori agaci.
   *
   * Eski sabit dortlu (marka/model/motor/paket) katalog secimi SILINMEDI;
   * asagida `!USE_HIERARCHY_WIZARD` altinda duruyor ve eski akislar bozulmuyor.
   * Uretimde kullanici agaci adim adim yuruyor ve KESIN yaprak kimligi
   * degerlemeye gonderiliyor.
   */
  const USE_HIERARCHY_WIZARD = true;
  const [hierarchyLeaf, setHierarchyLeaf] = useState<HierarchyNode | null>(null);
  const [hierarchyPath, setHierarchyPath] = useState<HierarchyNode[]>([]);

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
  /**
   * GOZLENEN kasa tipleri: katalogtaki BodyType sozlugu yerine, aracin KENDI
   * ilan havuzunda gercekten gorulen canonical kasa siniflari. Katalog
   * SPORTBACK / GRAN_COUPE icermiyor ve bazi modellerde (BMW 4 Serisi Cabrio)
   * dogru kasa hic secilemiyordu.
   */
  const [observedBodies, setObservedBodies] = useState<
    Array<{ value: string; displayLabel: string; listingCount: number }>
  >([]);
  const [selectedObservedBody, setSelectedObservedBody] = useState<string>('');
  const [availableFuels, setAvailableFuels] = useState<any[]>([]);
  const [availableTransmissions, setAvailableTransmissions] = useState<any[]>([]);

  // Detailed Appraisal (Paint Scheme & Status)
  // BOS = CEVAPLANMAMIS. Paneller sessizce ORIJINAL kabul EDILMEZ; kullanici
  // "işlem yok" derse ya da paneli acikca isaretlerse deger olusur.
  const [paintParts, setPaintParts] = useState<Record<string, PartStatus>>({});

  const [chassisAction, setChassisAction] = useState(false);
  const [heavyDamage, setHeavyDamage] = useState(false);
  const [scratchDent, setScratchDent] = useState(false);
  const [crackedGlass, setCrackedGlass] = useState(false);
  // Backend'in ZATEN okudugu, ancak formda sorulmadigi icin hicbir zaman
  // beyan edilemeyen kritik durumlar (yeni DTO alani eklenmedi):
  //   vehicleStatus.airbagDeployed / engineProblem / transmissionProblem
  //   paintScheme['Podye']  -> yapisal parca
  const [airbagDeployed, setAirbagDeployed] = useState(false);
  const [engineProblem, setEngineProblem] = useState(false);
  const [transmissionProblem, setTransmissionProblem] = useState(false);
  const [podyeDamage, setPodyeDamage] = useState(false);
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
  const [phoneTouched, setPhoneTouched] = useState(false);

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
    const isValidPhone = TR_PHONE_PATTERN.test(cleanedPhone);

    if (!isValidPhone) {
      setPhoneTouched(true);
      setUserModalError('Geçersiz telefon numarası girdiniz. Lütfen kontrol edip tekrar deneyiniz.');
      return;
    }

    sessionStorage.setItem('preEval_firstName', firstName.trim());
    sessionStorage.setItem('preEval_lastName', lastName.trim());
    sessionStorage.setItem('preEval_phone', cleanedPhone);
    
    setPhone(cleanedPhone);
    setShowUserModal(false);
  };

  // Isletme telefonu YAPILANDIRMADAN gelir ve zorunlu degildir.
  // Yapilandirilmamissa arama CTA'si HIC RENDER EDILMEZ: bos `tel:`
  // baglantisi ya da yer tutucu numara gostermek yerine ogeyi gizleriz.
  // Her uc ekranin da telefon disi calisan ikinci bir eylemi vardir.
  const supportTelHref = telHref(siteConfig.supportPhone);

  // Hata durumu yalnızca kullanıcı alana dokunduktan veya formu gönderdikten sonra gösterilir.
  const isPhoneValid = TR_PHONE_PATTERN.test(phone.replace(/[^0-9]/g, ''));
  const showPhoneError = phoneTouched && !isPhoneValid;

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

  /**
   * DEGERLEME YUKLEME DURUMU.
   *
   * Onceki surumde tek geri bildirim butonun "Değerlendiriliyor..." etiketiydi;
   * istek birkac yuz ms surdugu icin musteri ne oldugunu goremiyordu.
   * Mesajlar SAHTE YUZDE icermez ve canli Sahibinden baglantisi IDDIA ETMEZ —
   * degerleme mevcut ilan veritabani uzerinden yapilir.
   */
  const [loadingStep, setLoadingStep] = useState(0);
  const LOADING_MESSAGES = [
    'Aracınıza uygun emsal ilanlar taranıyor',
    'Benzer ilanların fiyatları karşılaştırılıyor',
    'Kilometre ve model yılı farkları dengeleniyor',
    'Teklifiniz hazırlanıyor',
  ];
  useEffect(() => {
    if (!isLoading) { setLoadingStep(0); return; }
    const id = setInterval(() => {
      setLoadingStep((p) => Math.min(p + 1, LOADING_MESSAGES.length - 1));
    }, 900);
    return () => clearInterval(id);
  }, [isLoading]);
  const [showKvkk, setShowKvkk] = useState(false);

  /**
   * MUSTERININ BEYAN OZETI — FIYAT TAHMINI DEGILDIR.
   *
   * Onceki surumde burada ayri bir "Tahmini Deger Dususu: %X" hesabi vardi.
   * Bu, arka uctaki Kondisyon V2 ile HICBIR ILGISI OLMAYAN ikinci bir
   * fiyatlama uygulamasiydi ve musteriye YANLIS sayi gosteriyordu:
   *   1 boyali kapi  -> ekranda %2   · gercekte %1,6 (yas + deger olcekli)
   *   sasi islemi    -> ekranda %25  · gercekte YUZDE YOK, MANUEL inceleme
   *   ust sinir      -> ekranda %60  · gercekte %28
   * Ayrica musteri, degerleme yapilmadan once "boya su kadar dusurur"
   * izlenimi aliyordu. Musteri burada fiyat hesaplamaz, DURUM BEYAN EDER.
   *
   * Yerine yalnizca ne beyan edildigi sayilir; fiyat etkisi sonucta gosterilir.
   */
  const conditionDeclarationSummary = () => {
    let painted = 0;
    let changed = 0;
    let local = 0;
    for (const status of Object.values(paintParts)) {
      if (status === 'DEGISEN') changed++;
      else if (status === 'BOYALI') painted++;
      else if (status === 'LOKAL') local++;
    }
    const extras: string[] = [];
    if (chassisAction) extras.push('şasi işlemi');
    if (podyeDamage) extras.push('podye');
    if (heavyDamage) extras.push('ağır hasar kaydı');
    if (airbagDeployed) extras.push('hava yastığı');
    if (engineProblem) extras.push('motor arızası');
    if (transmissionProblem) extras.push('şanzıman arızası');
    return { painted, changed, local, extras, total: painted + changed + local + extras.length };
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
      // ONCEDEN 'NO' idi: kullanici kondisyon bolumune hic dokunmadan
      // "hatasiz" beyaniyla teklif alabiliyordu. UNKNOWN != CLEAN.
      // Tip cikarimi degismesin diye literal tip korunur; RUNTIME degeri
      // bilerek undefined'dir -> kullanici acikca secmeden form gecerli olmaz.
      damageStatus: undefined as unknown as 'NO',
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
      .then((data) => setBrands(filterDirtyOptions(Array.isArray(data) ? data : [])))
      .catch(console.error);
  }, []);

  // Fetch models when brand or year changes
  useEffect(() => {
    if (!selectedBrand) {
      setModels([]);
      return;
    }
    const controller = new AbortController();
    const yearQuery = selectedYear ? `&year=${selectedYear}` : '';
    fetch(`${API_BASE}/models?brandId=${selectedBrand}${yearQuery}`, { signal: controller.signal })
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
        setModels(filterDirtyOptions(uniqueModels));
        setSelectedModel('');
        resetSubordinateOptions();
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [selectedBrand, selectedYear]);

  // Fetch variants when model, brand, or year changes
  useEffect(() => {
    if (!selectedModel || !selectedBrand || !selectedYear) {
      setAvailableVariants([]);
      setSelectedVariant('');
      return;
    }
    const controller = new AbortController();
    setIsVehicleDataLoading(true);
    fetch(`${API_BASE}/variants?modelId=${selectedModel}&brandId=${selectedBrand}&year=${selectedYear}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const variantsList = filterDirtyOptions(Array.isArray(data) ? data : []);
        setAvailableVariants(variantsList);
        if (variantsList.length === 1) {
          setSelectedVariant(variantsList[0].id);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      })
      .finally(() => setIsVehicleDataLoading(false));

    return () => controller.abort();
  }, [selectedModel, selectedBrand, selectedYear]);

  // Fetch packages when variant, model, brand, or year changes
  useEffect(() => {
    if (!selectedVariant || selectedVariant === 'UNKNOWN' || !selectedModel || !selectedBrand || !selectedYear) {
      setAvailablePackages([]);
      setSelectedPackage('');
      return;
    }
    const controller = new AbortController();
    fetch(`${API_BASE}/packages?variantId=${selectedVariant}&modelId=${selectedModel}&brandId=${selectedBrand}&year=${selectedYear}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const packagesList = filterDirtyOptions(Array.isArray(data) ? data : []);
        setAvailablePackages(packagesList);
        if (packagesList.length === 1) {
          setSelectedPackage(packagesList[0].id);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, [selectedVariant, selectedModel, selectedBrand, selectedYear]);

  // Gozlenen kasa tiplerini getir (salt-okunur; fiyat hesabi yapilmaz)
  useEffect(() => {
    if (!selectedModel || !selectedBrand || !selectedYear) {
      setObservedBodies([]);
      setSelectedObservedBody('');
      return;
    }
    const controller = new AbortController();
    const variantQuery =
      selectedVariant && selectedVariant !== 'UNKNOWN' ? `&variantId=${selectedVariant}` : '';
    fetch(
      `${API_BASE}/observed-body-types?modelId=${selectedModel}&brandId=${selectedBrand}&year=${selectedYear}${variantQuery}`,
      { signal: controller.signal },
    )
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setObservedBodies(list);
        // Tek gercek kasa varsa otomatik secilir; kaynagi UI'da acikca yazar.
        setSelectedObservedBody(list.length === 1 ? list[0].value : '');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });
    return () => controller.abort();
  }, [selectedVariant, selectedModel, selectedBrand, selectedYear]);

  const resetSubordinateOptions = () => {
    setSelectedVariant('');
    setSelectedPackage('');
    setSelectedBodyType('');
    setSelectedFuelType('');
    setSelectedTransmission('');
    setAvailableVariants([]);
    setAvailablePackages([]);
    setAvailableBodies([]);
    setObservedBodies([]);
    setSelectedObservedBody('');
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
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  // Auto-select single option if only 1 option available
  useEffect(() => {
    if (options.length === 1 && !value && !disabled && !isLoading) {
      onChange(options[0].id);
    }
  }, [options, value, disabled, isLoading, onChange]);

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

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, filteredOptions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredOptions.length) % Math.max(1, filteredOptions.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlightedIndex]) {
        onChange(filteredOptions[highlightedIndex].id);
        setIsOpen(false);
        setSearchTerm('');
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full" onKeyDown={handleKeyDown}>
      {/* Hidden Native Select for Playwright test compatibility */}
      <select
        data-testid={dataTestId}
        /*
          Bu gizli select `sr-only` oldugu icin EKRAN OKUYUCUYA GORUNURDUR;
          etiketsiz birakildiginda isimsiz bir form alani olarak okunuyordu.
        */
        aria-label={placeholder}
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
        data-testid={dataTestId ? `trigger-${dataTestId}` : undefined}
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
              {loadingMessage || 'Seçenekler yükleniyor...'}
            </span>
          ) : selectedOption ? (
            selectedOption.name === 'UNKNOWN' ? 'Motor bilgisi belirtilmemiş' : selectedOption.name
          ) : (
            placeholder
          )}
        </span>
        <div className="flex items-center gap-2">
          {options.length > 0 && !isLoading && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-500">
              {options.length}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
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
          <div className="p-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
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
            <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
              {filteredOptions.length} Sonuç
            </span>
          </div>

          {/* Options List (Max 8 visible items) */}
          <div className="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const displayName = opt.name === 'UNKNOWN' ? 'Motor bilgisi belirtilmemiş' : opt.name;
                const isSelected = opt.id === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-brand-orange text-white font-extrabold shadow-sm'
                        : isHighlighted
                        ? 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-900 dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'
                    }`}
                  >
                    <span>{displayName}</span>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })
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

  /**
   * Adim 1 tamam mi.
   *
   * Sihirbaz akisinda KESIN YAPRAK sarttir. Kullanici "Audi > A3"te durduysa
   * ve A3'un cocuklari varsa bu tamamlanmis bir arac DEGILDIR; devam
   * ettirmek ona A3 ortalamasini gostermek olurdu. LOADING/UNKNOWN/ERROR
   * durumlarinda `hierarchyLeaf` null kalir ve buton kapali kalir
   * (fail-closed).
   */
  const isStep1Complete = USE_HIERARCHY_WIZARD
    ? selectedYear !== '' && hierarchyLeaf !== null && hierarchyLeaf.isLeaf === true
    : selectedYear !== '' &&
      selectedBrand !== '' &&
      selectedModel !== '' &&
      selectedVariant !== '' &&
      (availablePackages.length === 0 || selectedPackage !== '');

  const handleStep1Next = () => {
    if (isStep1Complete) {
      setStep(2);
    }
  };

  const handleStep2Invalid = (errors: any) => {
    const errorList = Object.keys(errors || {}).map((key) => ({
      field: key,
      message: errors[key]?.message,
    }));
    console.log('[DEGERLEME FORM INVALID]', JSON.stringify(errorList));


    let firstErrorElement: HTMLElement | null = null;

    // Check first Zod validation error
    const firstErrorKey = Object.keys(errors || {})[0];
    if (firstErrorKey) {
      const target = document.querySelector(
        `[name="${firstErrorKey}"], [data-testid="vehicle-${firstErrorKey}"], [data-testid="step2-${firstErrorKey}"]`
      );
      if (target) firstErrorElement = target as HTMLElement;
    }

    // Check contact info
    if (!isContactInfoValid() && !firstErrorElement) {
      const phoneInput = document.querySelector('[data-testid="step2-phone"]');
      if (phoneInput) firstErrorElement = phoneInput as HTMLElement;
    }

    // Check equipment selection
    if (!isEquipmentValid() && !firstErrorElement) {
      const eqSection = document.getElementById('equipment-section') || document.querySelector('[data-section="equipment"]');
      if (eqSection) firstErrorElement = eqSection as HTMLElement;
    }

    if (firstErrorElement) {
      firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof firstErrorElement.focus === 'function') {
        firstErrorElement.focus();
      }
    }
  };

  /**
   * GERCEK ILAN VERISINDEN gelen secim (katalogda karsiligi yok) "OBS:<deger>"
   * kimligiyle gelir. Katalog eksikligi yuzunden gercek araclarin (orn. Fiat
   * Egea) formda kaybolmamasi icin bu secimler canonical degerleriyle
   * gonderilir; boylece degerleme katalogdan bagimsiz calisir.
   */
  const OBS_PREFIX = 'OBS:';
  const canonicalOf = (id: string, list: any[]): string => {
    if (!id) return '';
    if (id.startsWith(OBS_PREFIX)) return id.slice(OBS_PREFIX.length);
    return list.find((o) => o.id === id)?.name || '';
  };
  const isObservedSelection = () =>
    [selectedModel, selectedVariant, selectedPackage].some((id) => id && id.startsWith(OBS_PREFIX));

  /** Katalogda karsiligi olmayan secim varsa gozlenen hedefi gonder. */
  const buildObservedTarget = () => {
    /**
     * Sihirbaz akisinda kimlik AGACTAN gelir. Segment sinirlari zaten
     * kaynagin kendi gezinme yapisindan turetildi; burada metin YENIDEN
     * bosluktan BOLUNMEZ. Fiyat kimligi yine de `hierarchyLeafId`dir;
     * bunlar gosterim/kimlik alanlaridir.
     */
    if (USE_HIERARCHY_WIZARD && hierarchyLeaf) {
      const seg = hierarchyLeaf.pathSegments;
      return {
        observedMake: seg[0] || undefined,
        observedModel: (seg.length > 1 ? seg[1] : seg[0]) || undefined,
        observedEngine: (seg.length >= 4 ? seg[seg.length - 2] : '') || undefined,
        observedTrim: (seg.length >= 3 ? seg[seg.length - 1] : '') || undefined,
      };
    }
    if (!isObservedSelection()) return {};
    return {
      observedMake: canonicalOf(selectedBrand, brands) || undefined,
      observedModel: canonicalOf(selectedModel, models) || undefined,
      observedEngine: canonicalOf(selectedVariant, availableVariants) || undefined,
      observedTrim: canonicalOf(selectedPackage, availablePackages) || undefined,
    };
  };

  /**
   * Kullanicinin ACIKCA beyan ettigi bir kondisyon detayi var mi?
   * (isaretlenmis panel, yapisal/mekanik kutu ya da Tramer tutari)
   */
  const hasConditionDetail = () =>
    Object.values(paintParts).some((v) => v && v !== 'ORIJINAL') ||
    chassisAction || heavyDamage || podyeDamage || airbagDeployed ||
    engineProblem || transmissionProblem || scratchDent || crackedGlass ||
    (tramerAmount !== '' && Number(tramerAmount) > 0);

  /**
   * Kaporta semasi payload'i:
   *   NO      -> kullanici ACIKCA "islem yok" dedi; tum paneller ORIJINAL uretilir
   *   UNKNOWN -> bilgi yok; hicbir panel beyani gonderilmez (UNKNOWN != CLEAN)
   *   YES     -> YALNIZ kullanicinin isaretledigi paneller gonderilir;
   *              dokunulmamis panel "orijinal" olarak UYDURULMAZ
   */
  const buildPaintSchemePayload = (damageStatus: string): Record<string, PartStatus> => {
    if (damageStatus === 'NO') {
      const all: Record<string, PartStatus> = {};
      BODY_PARTS.forEach((part) => (all[part] = 'ORIJINAL'));
      return all;
    }
    if (damageStatus === 'UNKNOWN') return {};
    const answered: Record<string, PartStatus> = {};
    for (const [part, status] of Object.entries(paintParts)) {
      if (status && status !== 'ORIJINAL') answered[part] = status;
    }
    if (podyeDamage) answered['Podye'] = 'DEGISEN';
    return answered;
  };

  const handleStep2Submit = async (formData: any) => {
    // Kondisyon beyani: sessizlik "temiz" sayilmaz.
    if (!formData.damageStatus) {
      alert('Lütfen aracınızın boya/değişen durumunu belirtiniz. Emin değilseniz "Bilmiyorum" seçebilirsiniz.');
      document.querySelector('[data-section="condition"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (formData.damageStatus === 'YES' && !hasConditionDetail()) {
      alert('“İşlem var” seçtiniz. Lütfen en az bir panel ya da hasar bilgisini işaretleyin. Detayı bilmiyorsanız hasar durumunu “Bilmiyorum” olarak seçebilirsiniz.');
      document.querySelector('[data-section="condition"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    /**
     * Bayat/eksik arac secimi kontrolu.
     *
     * Bu bekci eski katalog alanlarina (selectedBrand/selectedModel) bakiyordu.
     * Sihirbaz akisinda o alanlar TANIMI GEREGI bostur; kontrol oldugu gibi
     * birakilsaydi kullanici tum formu doldurup "Degerle"ye bastiginda 1. adima
     * geri atilirdi. Her akis KENDI tamamlanmislik kanitina bakar.
     */
    const vehicleSelectionMissing = USE_HIERARCHY_WIZARD
      ? !selectedYear || !hierarchyLeaf || hierarchyLeaf.isLeaf !== true
      : !selectedBrand || !selectedYear || !selectedModel;

    if (vehicleSelectionMissing) {
      alert('Araç seçiminiz eksik ya da güncellendi. Lütfen aracınızı yeniden seçin.');
      if (!USE_HIERARCHY_WIZARD) resetSubordinateOptions();
      setStep(1);
      return;
    }

    // Custom validation check (equipment & contact info)
    if (!isEquipmentValid() || !isContactInfoValid()) {
      handleStep2Invalid(errors);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/vehicle-evaluation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(selectedYear),
          ...(USE_HIERARCHY_WIZARD && hierarchyLeaf
            ? {
                /**
                 * KESIN YAPRAK KIMLIGI. Backend emsal havuzunu TAM bu
                 * yaprağin kaynak sayfalariyla sinirlar; ust seviyeye
                 * (tum A3, tum A3 Sportback) sessiz genisleme YOK.
                 */
                hierarchyLeafId: hierarchyLeaf.id,
                /**
                 * Katalog UUID'si ISIM BENZERLIGIYLE TAHMIN EDILMEZ.
                 * Sozlesmede zorunlu olan bu alanlar, projenin kendi "OBS:"
                 * gozlenen-deger bicimiyle doldurulur.
                 */
                manufacturerId: OBS_PREFIX + (hierarchyLeaf.pathSegments[0] || ''),
                modelId:
                  OBS_PREFIX +
                  (hierarchyLeaf.pathSegments[1] || hierarchyLeaf.pathSegments[0] || ''),
              }
            : {
                manufacturerId: selectedBrand,
                modelId: selectedModel,
                variantId:
                  selectedVariant && selectedVariant !== 'UNKNOWN' ? selectedVariant : undefined,
                packageId: selectedPackage || undefined,
              }),
          bodyTypeId: USE_HIERARCHY_WIZARD ? undefined : selectedBodyType || undefined,
          fuelTypeId: selectedFuelType || undefined,
          transmissionTypeId: selectedTransmission || undefined,
          licensePlate: formData.licensePlate.toUpperCase(),
          mileage: Number(formData.mileage),
          color: formData.color,
          damageStatus: formData.damageStatus,
          tramerAmount: formData.damageStatus === 'YES' ? (tramerAmount ? `${Number(tramerAmount).toLocaleString('tr-TR')} TL` : 'Var') : (formData.damageStatus === 'NO' ? '0 TL' : 'Bilinmiyor'),
          paintScheme: JSON.stringify(buildPaintSchemePayload(formData.damageStatus)),
          chassisState: JSON.stringify({ 'Şasi': chassisAction }),
          vehicleStatus: JSON.stringify({
            heavyDamage,
            scratchOrDent: scratchDent,
            crackedGlass,
            airbagDeployed,
            engineProblem,
            transmissionProblem,
          }),
          observedBodyType: selectedObservedBody || undefined,
          ...buildObservedTarget(),
          
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
        // Arka ucun hata metni MUSTERIYE BASILMAZ (dogrulama ciktisi/ic jargon
        // tasiyabilir); teshis icin konsola yazilir.
        const err = await response.json().catch(() => ({ message: 'Değerleme işlemi başarısız.' }));
        console.error('Valuation API error:', response.status, err);
        setValuationResult({ status: 'ERROR', networkError: false });
        setStep(3);
        return;
      }

      const result = await response.json();
      setValuationResult(result);
      setStep(3);
    } catch (error: any) {
      console.error('Valuation submission error:', error);
      // Teknik ayrinti (ornegin "backend servisi kapali") MUSTERIYE GOSTERILMEZ;
      // yalnizca baglanti hatasi mi degil mi bilgisi tasinir.
      const isNetworkError = error.message?.includes('NetworkError') || error.message?.includes('fetch');
      setValuationResult({ status: 'ERROR', networkError: Boolean(isNetworkError) });
      setStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 md:px-8 py-10 md:py-16 flex-1 flex flex-col justify-center">
      {/* Değerleme yükleme katmanı */}
      {isLoading && (
        <div
          data-testid="valuation-loading-overlay"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 dark:bg-zinc-950/85 backdrop-blur-sm px-6"
        >
          <div className="glass-card rounded-3xl p-8 border border-brand-orange/20 flex flex-col items-center gap-5 max-w-sm w-full text-center bg-white dark:bg-zinc-900">
            <div className="w-14 h-14 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-center">
              <div className="w-7 h-7 border-[3px] border-brand-orange border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white">
                Aracınız değerlendiriliyor
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 min-h-[2rem]">
                {LOADING_MESSAGES[loadingStep]}…
              </p>
            </div>
            {/* Adim gostergesi — yuzde IDDIA ETMEZ, yalnizca ilerleyisi belli eder */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {LOADING_MESSAGES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${
                    i <= loadingStep ? 'w-6 bg-brand-orange' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'
                  }`}
                />
              ))}
            </div>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              Değerleme, veritabanımızdaki gerçek ilan verileri üzerinden yapılır.
            </p>
          </div>
        </div>
      )}

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

              {/* Sabit 6 adimli gosterge yalnizca ESKI katalog akisi icindir;
                  agac derinligi araca gore degistigi icin sihirbazda anlamsizdir. */}
              {!USE_HIERARCHY_WIZARD && (
                <>
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
                  {selectedPackage && 'Tüm araç bilgileri tamamlandı! Aşağıdaki “Devam Et” butonuyla ilerleyebilirsiniz.'}
                </span>
              </div>
                </>
              )}
            </div>

            {/* ARAC SECIMI — KAYNAGIN GERCEK KATEGORI AGACI */}
            {USE_HIERARCHY_WIZARD && (
              <div className="flex flex-col gap-3 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Aracınız</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Her adımda yalnızca seçtiğiniz kategorinin alt seçenekleri gösterilir.
                    </p>
                  </div>
                  {hierarchyLeaf && (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <CheckCircle className="w-3.5 h-3.5" /> Seçildi
                    </span>
                  )}
                </div>
                {/*
                  MODEL YILI. Eski akista bu alan katalog bloklarinin icindeydi;
                  sihirbaza gecince onlarla birlikte gizlenmisti ve degerleme
                  motorunun ZORUNLU girdisi kayboluyordu. Sihirbaz akisinin
                  kendi yil alani burada.
                */}
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                  Model yılı
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value === '' ? '' : Number(e.target.value))}
                  data-testid="hierarchy-year"
                  className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                >
                  <option value="">Model yılı seçin</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                <VehicleHierarchyWizard
                  onChange={(path) => {
                    // Ust seviye degisince ALT seciMler temizlenir; eski yaprak
                    // hicbir sekilde istekte kalmaz.
                    setHierarchyPath(path);
                    setHierarchyLeaf(null);
                  }}
                  onComplete={(leaf) => setHierarchyLeaf(leaf)}
                />
              </div>
            )}

            {/* ESKI SABIT KATALOG SECIMI — silinmedi, uretimde kapali */}
            {!USE_HIERARCHY_WIZARD && (
              <>
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
                      data-testid="vehicle-brand"
                      aria-label="Marka seçimi"
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
                      <option value="">-- Tüm Markalar ({safeBrands.length} Marka Kataloğumuzda Mevcut) --</option>
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
                      aria-label="Model yılı seçimi"
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
                      aria-label="Model seçimi"
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
                {/* Kasa Tipi — seçenekler GERÇEK ilan havuzundan gelir */}
                <div className="flex flex-col gap-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{t('wiz.body')}</label>
                  {observedBodies.length === 0 ? (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                      Bu araç için ilan verisinde kasa tipi bilgisi bulunamadı; kasa dikkate alınmadan
                      değerlendirilecektir.
                    </div>
                  ) : observedBodies.length === 1 ? (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between gap-2">
                      <span>{observedBodies[0].displayLabel}</span>
                      <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold whitespace-nowrap">
                        {observedBodies[0].listingCount} gerçek ilan
                      </span>
                    </div>
                  ) : (
                    <select
                      value={selectedObservedBody}
                      onChange={(e) => setSelectedObservedBody(e.target.value)}
                      data-testid="observed-body-select"
                      className="glass-input rounded-xl p-3.5 text-sm w-full font-semibold"
                    >
                      <option value="">{t('wiz.select')}</option>
                      {observedBodies.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.displayLabel} ({b.listingCount} ilan)
                        </option>
                      ))}
                      <option value="UNKNOWN">Bilmiyorum</option>
                    </select>
                  )}
                  {observedBodies.length > 1 && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                      Seçenekler bu araç için gerçek ilanlarda görülen kasa tiplerinden alınmıştır.
                    </span>
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
              </>
            )}

            {/*
              SECIM OZETI (sihirbaz akisi) — TEK KAYNAK: `hierarchyPath`.
              Breadcrumb, bu ozet ve istege giden `hierarchyLeafId` ayni
              secilen yoldan turer; ayri algoritmalar kullanilmaz.
            */}
            {USE_HIERARCHY_WIZARD && hierarchyPath.length > 0 && (
              <div
                data-testid="wizard-selection-summary"
                className="mt-4 p-4 rounded-2xl bg-brand-orange/10 border border-brand-orange/20 flex items-center justify-between flex-wrap gap-2"
              >
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-brand-orange" />
                  <span
                    data-testid="wizard-selection-path"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200"
                  >
                    Seçilen Araç: {selectedYear ? `${selectedYear} ` : ''}
                    {hierarchyPath.map((n) => n.name).join(' › ')}
                  </span>
                </div>
                {hierarchyLeaf ? (
                  <span className="text-[10px] font-black uppercase bg-emerald-500 text-white px-2.5 py-1 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> SEÇİM TAMAMLANDI
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase bg-amber-500 text-white px-2.5 py-1 rounded-full">
                    ALT SEÇENEK BEKLENİYOR
                  </span>
                )}
              </div>
            )}

            {/* Live Vehicle Selection Summary Badge */}
            {!USE_HIERARCHY_WIZARD && (selectedBrand || selectedModel) && (
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
                    {!selectedModel ? 'Model Seçimi Bekleniyor' : !selectedVariant ? 'Motor / Versiyon Seçimi Bekleniyor' : 'Donanım Paketi Seçimi Bekleniyor'}
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

            <form onSubmit={handleSubmit(handleStep2Submit, handleStep2Invalid)} className="flex flex-col gap-6">
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
                <div className="flex flex-col gap-2" data-section="condition">
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
                  {errors.damageStatus && (
                    <span data-testid="vehicle-form-error" className="text-[11px] text-red-500 font-medium">
                      {errors.damageStatus.message as string}
                    </span>
                  )}

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
                          Aracınızın parça bazlı durumunu işaretleyin. Fiyat etkisi, değerleme sonucunda gösterilir.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                      {/*
                        BEYAN OZETI — fiyat tahmini DEGIL.
                        Fiyat etkisi yalnizca degerleme sonucunda, gercek
                        Kondisyon V2 hesabiyla gosterilir.
                      */}
                      {(() => {
                        const d = conditionDeclarationSummary();
                        if (d.total === 0) {
                          return (
                            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                              Henüz işlem işaretlenmedi
                            </div>
                          );
                        }
                        const parts = [
                          d.changed ? `${d.changed} değişen` : '',
                          d.painted ? `${d.painted} boyalı` : '',
                          d.local ? `${d.local} lokal` : '',
                        ].filter(Boolean).join(' · ');
                        return (
                          <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold max-w-[220px]">
                            Beyanınız: {parts || 'ek durum'}
                            {d.extras.length > 0 && (
                              <span className="block font-normal opacity-80 mt-0.5">
                                + {d.extras.join(', ')}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Quick "Set All Original" Button */}
                      <button
                        type="button"
                        onClick={() => {
                          const resetObj: Record<string, PartStatus> = {};
                          BODY_PARTS.forEach((p) => (resetObj[p] = 'ORIJINAL'));
                          setPaintParts(resetObj);
                          setPodyeDamage(false);
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
                      { label: 'Podye İşlemi / Hasarı Var', state: podyeDamage, setState: setPodyeDamage, icon: '🧱' },
                      { label: 'Hava Yastığı Açılmış', state: airbagDeployed, setState: setAirbagDeployed, icon: '🎈' },
                      { label: 'Ciddi Motor Arızası Var', state: engineProblem, setState: setEngineProblem, icon: '⚙️' },
                      { label: 'Ciddi Şanzıman Arızası Var', state: transmissionProblem, setState: setTransmissionProblem, icon: '🔧' },
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
                  disabled={isLoading}
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
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Bu araç için yeterli piyasa verisi bulunamadı
                </h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  Aracınıza yeterince benzeyen ilan bulunmadığı için yanlış bir fiyat göstermek istemiyoruz.
                  Bunun yerine aracınızı uzmanımız değerlendirsin.
                </p>
                {/* Musteri bilgileri zaten alindi; bu yuzden asil eylem iletisim. */}
                <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full max-w-sm">
                  {supportTelHref && (
                    <a
                      data-testid="insufficient-contact-cta"
                      href={supportTelHref}
                      className="flex-1 bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer text-center"
                    >
                      Uzmanımızı Arayın
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer"
                  >
                    Araç Bilgilerini Düzenle
                  </button>
                </div>
              </motion.div>
            );
          }

          // Case 2: MANUAL_EVALUATION_REQUIRED — FIYATSIZ ise bilgi karti.
          //
          // FIYATLI MANUEL SONUC ARTIK FIYAT KARTIYLA GOSTERILIR: is kurali
          // "MANUEL fiyatli bir ON degerlemedir, basarisizlik degildir".
          // Arka uc piyasa/nakit/net/ilan degerlerini hesaplamis ve
          // saklamisken musteriye yalnizca "uzman incelemesi" karti gostermek,
          // fiyati gizliyor ve sayfayi hata gibi okutuyordu (olculen: Abarth
          // N=1 yolu fiyatsiz bilgi karti aliyordu). Uzman kontrolu mesaji
          // fiyat kartinin USTUNDE ikincil serit olarak verilir (asagida).
          if (status === 'MANUAL_EVALUATION_REQUIRED' && !valuationResult.results) {
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
                {/*
                  MANUEL BIR HATA DEGILDIR: musteri degerlemeyi TAMAMLADI,
                  sistem bilerek uzman incelemesi istiyor. Basarisizlik dili
                  kullanilmaz ve GALERI ICI gerekce (dusuk guven, musteri
                  tabani, kar catismasi) MUSTERIYE GOSTERILMEZ.
                */}
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  Aracınız için uzman incelemesi gerekiyor
                </h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  Değerleme talebiniz bize ulaştı. {manualReasonForCustomer(valuationResult.aiAnalysis)}
                </p>
                <p className="text-[11px] text-zinc-400 max-w-md leading-relaxed">
                  Bıraktığınız telefon numarası üzerinden ekibimiz sizinle iletişime geçecek.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full max-w-sm">
                  {supportTelHref && (
                    <a
                      data-testid="manual-contact-cta"
                      href={supportTelHref}
                      className="flex-1 bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer text-center"
                    >
                      Hemen Uzmanımızı Arayın
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer"
                  >
                    Araç Bilgilerini Düzenle
                  </button>
                </div>
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
                {/*
                  MUSTERIYE DAHILI METIN BASILMAZ.

                  Onceki surumde burada `valuationResult.message` dogrudan
                  gosteriliyordu. Bu alan uc ayri ic metin tasiyabiliyordu:
                    - "Backend servisi kapali ... backend sunucusunu baslatip"
                      -> musteriye sunucu baslatmasi soyleniyordu
                    - "Veri butunlugu hatasi: Duzeltilmis P35 degeri ..."
                      -> ic fiyat zinciri jargonu
                    - arka ucun ham dogrulama hata metni
                  Teknik ayrinti artik yalnizca konsola yazilir.

                  Baslik da duzeltildi: DATA_INTEGRITY_ERROR bir BAGLANTI
                  hatasi degildir, bu yuzden tek tip "baglanti hatasi" basligi
                  kullanilmiyor.
                */}
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {valuationResult.networkError
                    ? 'Sunucuya ulaşılamadı'
                    : 'Değerlemeyi şu anda tamamlayamadık'}
                </h3>
                <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
                  {valuationResult.networkError
                    ? 'İnternet bağlantınızı kontrol edip tekrar deneyiniz.'
                    : 'Aracınızın değerlemesi tamamlanamadı. Tekrar deneyebilir veya uzmanımızla görüşebilirsiniz.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full max-w-sm">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer"
                  >
                    Tekrar Dene
                  </button>
                  {!valuationResult.networkError && supportTelHref && (
                    <a
                      data-testid="error-contact-cta"
                      href={supportTelHref}
                      className="flex-1 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-200 text-xs font-bold px-6 py-3 rounded-xl transition-all cursor-pointer text-center"
                    >
                      Uzmanımızı Arayın
                    </a>
                  )}
                </div>
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
          /**
           * GERCEK PIYASA REFERANSI — arka uctan gelen deger kullanilir.
           * `marketReferenceValue` kondisyon ONCESI temiz esdeger emsal
           * merkezidir; `conditionAdjustedSaleValue` musterinin beyan ettigi
           * kondisyondan SONRAKI beklenen degerdir. Hicbiri nakit teklifden
           * ya da sabit bir carpandan TURETILMEZ.
           */
          const marketReferencePrice = activeResults.marketReferenceValue ?? activeResults.fairMarketValue ?? 0;
          const conditionAdjustedPrice = activeResults.conditionAdjustedSaleValue ?? activeResults.expectedSalePrice ?? 0;
          // Kondisyon beyani gercekten deger dusurduyse iki satiri da goster.
          const showConditionAdjusted =
            conditionAdjustedPrice > 0 &&
            marketReferencePrice > 0 &&
            conditionAdjustedPrice < marketReferencePrice;
          // Konsinyede müşteriye asıl önemli olan, ilan fiyatı değil eline geçecek net tutardır.
          const consignmentExpectedSale = activeResults.expectedConsignmentSalePrice || activeResults.expectedSalePrice || 0;
          // MUSTERI NETI YALNIZCA ARKA UCTAN GELIR.
          // Once `customerConsignmentNet || consignmentPrice` yaziliyordu; net
          // gelmediginde musteriye ILAN FIYATI "size kalacak net" etiketiyle
          // gosteriliyordu. Ilan fiyati beklenen satisin USTUNDEDIR, yani
          // musteriye gercekte alacagindan fazlasi vaat edilmis olurdu.
          const rawCustomerNet = activeResults.customerConsignmentNet ?? activeResults.agreedCustomerNet;
          const consignmentCustomerNet =
            typeof rawCustomerNet === 'number' && Number.isFinite(rawCustomerNet) && rawCustomerNet > 0
              ? rawCustomerNet
              : null;
          const estimatedDaysToSell = activeResults.estimatedDaysToSell || '';

          return (
            <motion.div
              key="step3-success"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="valuation-success-card"
              className="flex flex-col gap-8 w-full"
            >
              {/* MANUEL: fiyat gorunur kalir; uzman kontrolu IKINCIL mesajdir. */}
              {status === 'MANUAL_EVALUATION_REQUIRED' && (
                <div
                  data-testid="manual-review-banner"
                  className="glass-card rounded-2xl px-5 py-4 border border-blue-500/30 bg-blue-500/5 flex items-start gap-3"
                >
                  <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white">
                      Ön değerlemeniz hazır — nihai teklif için uzman kontrolü öneriyoruz.
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {manualReasonForCustomer(valuationResult.aiAnalysis)} Ekibimiz, bıraktığınız telefon numarasından sizinle iletişime geçecek.
                    </p>
                  </div>
                </div>
              )}

              {/* Header summary */}
              <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-800/10 dark:border-white/5 text-center flex flex-col items-center gap-2">
                <span className="text-[10px] text-brand-orange uppercase font-extrabold tracking-widest bg-brand-orange/10 px-3 py-1 rounded-full border border-brand-orange/20">
                  {t('wiz.step3.title')}
                </span>
                <h2 data-testid="result-vehicle-name" className="text-2xl md:text-3xl font-black text-zinc-900 dark:text-white mt-2">
                  {Array.isArray((activeVehicle as any).hierarchyPath) &&
                  (activeVehicle as any).hierarchyPath.length > 0
                    ? `${activeVehicle.year} ${(activeVehicle as any).hierarchyPath.join(' ')}`
                    : `${activeVehicle.year} ${activeVehicle.brand} ${activeVehicle.model}`}
                </h2>
                {/*
                  TAM YOL GOSTERIMI. brand/model/variant/package dortlusu sabit
                  rol atadigi icin derinlik degistiginde ORTA SEGMENTI dusuruyor
                  ("Chevrolet / Cruze / 1.6 / LS / Plus" -> "Cruze / LS / Plus").
                  Kaynak agacindan gelen tam yol varsa kullanicinin GERCEKTEN
                  sectigi zincir aynen gosterilir.
                */}
                {Array.isArray((activeVehicle as any).hierarchyPath) &&
                (activeVehicle as any).hierarchyPath.length > 0 ? (
                  <p data-testid="result-vehicle-details" className="text-xs text-zinc-500">
                    {(activeVehicle as any).hierarchyPath.join(' › ')}
                  </p>
                ) : (
                  <p data-testid="result-vehicle-details" className="text-xs text-zinc-500">
                    {activeVehicle.variant} {activeVehicle.package ? `- ${activeVehicle.package}` : ''}{' '}
                    {activeVehicle.transmission ? `- ${activeVehicle.transmission}` : ''} {activeVehicle.fuelType ? `- ${activeVehicle.fuelType}` : ''}
                  </p>
                )}
              </div>

              {/* Valuation Stats Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Price display */}
                <div className="md:col-span-2 glass-card rounded-3xl p-6 md:p-8 border border-brand-orange/30 dark:border-brand-orange/20 flex flex-col justify-between relative overflow-hidden bg-gradient-to-br from-brand-orange/5 via-transparent to-emerald-500/5">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-brand-orange/10 rounded-bl-[100px] blur-[30px] pointer-events-none" />

                  {/* Piyasa Referansı (+ beyan edilen kondisyon sonrası) */}
                  <div className="mb-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                        Piyasa Referansı
                        <span className="block text-[10px] font-normal opacity-80">Benzer ilanların ortalama seviyesi</span>
                      </span>
                      <span data-testid="result-fair-market-value" className="text-lg font-black text-zinc-900 dark:text-white whitespace-nowrap">
                        {formatTL(marketReferencePrice)}
                      </span>
                    </div>
                    {showConditionAdjusted && (
                      <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-dashed border-zinc-200 dark:border-zinc-800">
                        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
                          Beyan Ettiğiniz Duruma Göre
                          <span className="block text-[10px] font-normal opacity-80">Bildirdiğiniz boya/değişen/hasar dikkate alındı</span>
                        </span>
                        <span data-testid="result-condition-adjusted-value" className="text-base font-extrabold text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                          {formatTL(conditionAdjustedPrice)}
                        </span>
                      </div>
                    )}
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
                          {formatTL(cashOfferPrice)}
                        </div>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mt-2 leading-relaxed">
                          Aracınızı <strong>30 dakikada nakit sizden satın alırız</strong>. Bu tutar,
                          hiçbir kesinti olmadan <strong>doğrudan elinize geçen nettir</strong>.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1">
                        ⚡ Aynı gün ödeme & Sıfır bürokrasi, beklemek yok
                      </div>
                    </div>

                    {/* SEÇENEK 2: Konsinye (Dükkana Bırakma) Satış */}
                    <div className="p-5 rounded-2xl bg-brand-orange/10 dark:bg-brand-orange/15 border-2 border-brand-orange/40 relative overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-orange text-white text-[11px] font-black uppercase tracking-wider mb-2">
                          🎯 2. Dükkana (Konsinye) Bırakma Fiyatı
                        </div>
                        <div className="text-[11px] font-bold text-brand-orange/80 dark:text-orange-200/80 mt-1">
                          Size kalacak tahmini net
                        </div>
                        <div data-testid="result-consignment-net" className="text-3xl lg:text-4xl font-black text-brand-orange tracking-tight">
                          {consignmentCustomerNet !== null ? formatTL(consignmentCustomerNet) : 'Uzmanımız belirleyecek'}
                        </div>

                        <div className="mt-3 space-y-1.5 text-[11px] font-semibold text-brand-orange/90 dark:text-orange-200">
                          <div className="flex items-center justify-between gap-2">
                            <span>İlan fiyatımız</span>
                            <span data-testid="result-consignment-price" className="font-black">
                              {formatTL(consignmentPrice)}
                            </span>
                          </div>
                          {consignmentExpectedSale > 0 && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Tahmini satış fiyatı</span>
                              <span data-testid="result-consignment-expected-sale" className="font-black">
                                {formatTL(consignmentExpectedSale)}
                              </span>
                            </div>
                          )}
                          {estimatedDaysToSell && (
                            <div className="flex items-center justify-between gap-2">
                              <span>Tahmini satış süresi</span>
                              <span data-testid="result-consignment-duration" className="font-black">
                                {estimatedDaysToSell}
                              </span>
                            </div>
                          )}
                        </div>

                        <p className="text-xs font-semibold text-brand-orange/90 dark:text-orange-200 mt-3 leading-relaxed">
                          Aracınızı galerimize emanet bırakırsanız <strong>sizin adınıza satarız</strong>;
                          satış gerçekleştiğinde yukarıdaki net tutar elinize geçer.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-brand-orange/20 text-[11px] text-brand-orange font-bold flex items-center gap-1">
                        🏪 Galerimizde sergileme & Nakit teklife göre daha yüksek kazanç
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
                      {/*
                        GUVEN: ciplak sayi tek basina musteriye anlam ifade
                        etmiyordu; ustelik `|| 85` yedegi, guven 0 geldiginde
                        UYDURMA bir deger gosteriyordu. Artik gercek skor
                        ANLAMLANDIRILARAK sunulur, yoksa hic gosterilmez.
                      */}
                      {(() => {
                        const c = activeResults.confidenceScore;
                        if (typeof c !== 'number' || !Number.isFinite(c)) {
                          return (
                            <div>
                              <div className="text-xs text-zinc-500">Emsal Desteği</div>
                              <div className="text-sm font-bold text-zinc-500">Belirtilmedi</div>
                            </div>
                          );
                        }
                        const label = c >= 85 ? 'Güçlü emsal desteği'
                          : c >= 70 ? 'Orta emsal desteği'
                          : 'Sınırlı emsal desteği';
                        const tone = c >= 85 ? 'text-emerald-600 dark:text-emerald-400'
                          : c >= 70 ? 'text-amber-600 dark:text-amber-400'
                          : 'text-zinc-600 dark:text-zinc-300';
                        return (
                          <div>
                            <div className="text-xs text-zinc-500">Emsal Desteği</div>
                            <div className={`text-base font-extrabold ${tone}`}>{label}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Benzer ilanların sayısı ve birbirine yakınlığına göre (%{c})
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500">Değerlemede Kullanılan İlan</div>
                        <div className="text-lg font-extrabold text-zinc-900 dark:text-white">
                          {activeResults.actuallyUsedListingCount || activeResults.matchedListingCount || 0} benzer ilan
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          Aracınıza en yakın gerçek ilanlar üzerinden hesaplandı
                        </div>
                      </div>
                    </div>

                    {/*
                      Ham paket dagilimi (teknik doku) musteriye deger katmiyor;
                      galeri panelinde zaten mevcut. Musteri ekraninda gizlendi.
                    */}
                    {false && activeResults.usedTrimDistribution && Object.keys(activeResults.usedTrimDistribution).length > 0 && (
                      <div className="mt-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                        <div className="text-xs font-bold mb-2">Donanım Dağılımı</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(activeResults.usedTrimDistribution).map(([trim, count]) => (
                            <span key={trim} className="text-[10px] px-2 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md">
                              {trim}: {String(count)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Analysis section */}
              {customerFacingNotes(valuationResult.aiAnalysis).length > 0 && (
                <div className="glass-card rounded-3xl p-6 md:p-8 border border-zinc-800/10 dark:border-white/5 flex flex-col gap-4">
                  <h3 className="text-md font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-orange" />
                    {t('wiz.step3.ai')}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {customerFacingNotes(valuationResult.aiAnalysis).map((item: string, i: number) => (
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
                      onBlur={() => {
                        // Hiç yazılmamış alanı hatalı göstermiyoruz; sadece girilen değer doğrulanır.
                        if (phone.length > 0) setPhoneTouched(true);
                      }}
                      maxLength={11}
                      aria-invalid={showPhoneError}
                      aria-describedby="welcome-phone-hint"
                      className={`glass-input rounded-xl p-3 pl-9 text-xs w-full ${showPhoneError ? 'glass-input-error' : ''}`}
                    />
                  </div>
                  {showPhoneError ? (
                    <p id="welcome-phone-hint" className="text-[10px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Numara 5 ile başlamalı ve 10 veya 11 haneli olmalıdır.
                    </p>
                  ) : (
                    <p id="welcome-phone-hint" className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">Örnek: 05XX XXX XX XX</p>
                  )}
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
