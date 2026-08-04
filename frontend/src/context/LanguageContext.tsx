'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Language = 'tr' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const translations: Record<Language, Record<string, string>> = {
  tr: {
    // Navbar & Common
    'nav.brand': 'NAKİT GARAJ',
    'nav.home': 'Ana Sayfa',
    'nav.valuation': 'Araç Değerleme',
    'nav.consignment': 'Konsinye Bırak',
    'nav.admin': 'Yönetici Paneli',
    'nav.logout': 'Çıkış Yap',
    
    // Footer
    'footer.desc': 'Türkiye\'nin yapay zeka destekli, şeffaf ve güvenilir otomotiv pazar yeri değerleme ve konsinye platformu.',
    'footer.rights': 'Tüm hakları saklıdır.',
    
    // Homepage
    'home.badge': 'Yapay Zeka Destekli Otomotiv Platformu',
    'home.title': 'Aracınızın Gerçek Değerini Saniyeler İçinde Öğrenin',
    'home.subtitle': 'Cardata, Indicata ve Data Değer gibi kurumsal veri sağlayıcılarının yasal veritabanı katsayıları ve yapay zeka algoritmamızla aracınızı şeffafça değerleyin.',
    'home.card1.title': 'Akıllı Araç Değerleme',
    'home.card1.desc': 'Aracınızın kilometresi, hasar durumu, paket donanımı ve bölgesel pazar talebine göre anlık piyasa değerini hesaplayın.',
    'home.card1.button': 'Hemen Değerleme Başlat',
    'home.card2.title': 'Konsinye Hizmeti',
    'home.card2.desc': 'Aracınızı değerinde ve hızlı satmak için profesyonel satış ekibimize, güvenli otoparkımıza ve ilan ağlarımıza teslim edin.',
    'home.card2.button': 'Konsinye Başvurusu Yap',
    
    // Valuation Wizard Step 1
    'wiz.step1.title': 'Araç Kimliği Belirleme',
    'wiz.step1.desc': 'Aracınızın temel özelliklerini listeden belirleyin.',
    'wiz.select': 'Seçiniz',
    'wiz.year': 'Model Yılı',
    'wiz.brand': 'Marka',
    'wiz.model': 'Model',
    'wiz.variant': 'Versiyon / Motor',
    'wiz.package': 'Donanım Paketi',
    'wiz.body': 'Kasa Tipi',
    'wiz.fuel': 'Yakıt Tipi',
    'wiz.transmission': 'Vites Tipi',
    
    // Valuation Wizard Step 2
    'wiz.step2.title': 'Araç Kondisyon Bilgileri',
    'wiz.step2.desc': 'Plaka, kilometre ve hasar durumunu girin.',
    'wiz.plate': 'Plaka',
    'wiz.mileage': 'Kilometre (km)',
    'wiz.color': 'Renk',
    'wiz.damage': 'Hasar Kaydı Var mı?',
    'wiz.damage.no': 'Hayır',
    'wiz.damage.yes': 'Evet',
    'wiz.damage.unknown': 'Belirsiz',
    'wiz.kvkk.checkbox': 'KVKK Aydınlatma Metni kapsamında araç verilerimin değerleme amaçlı işlenmesini ve kaydedilmesini kabul ediyorum.',
    'wiz.kvkk.link': 'KVKK Aydınlatma Metni',
    'wiz.back': 'Geri',
    'wiz.next': 'Devam Et',
    'wiz.calculate': 'Değerleme Hesapla',
    
    // Valuation Wizard Step 3
    'wiz.step3.title': 'NakitGaraj Değerleme & Satış Seçenekleri',
    'wiz.step3.offer': '1. Anında Nakit Alım Teklifi',
    'wiz.step3.offer.desc': 'Aracınızı 30 dakikada anında nakit sizden satın alırız, Sahibinden\'de direkt kendimiz satarız.',
    'wiz.step3.consignment.title': '2. Dükkana (Konsinye) Bırakma Fiyatı',
    'wiz.step3.consignment.desc': 'Aracınızı dükkanımıza emanet bırakırsanız, sizin adınıza bu fiyata ilan açıp satarız.',
    'wiz.step3.fair': 'Sahibinden Piyasa Değeri',
    'wiz.step3.fair.desc': 'Sahibinden.com ortalama ilan satış fiyatı',
    'wiz.step3.quick': 'Hızlı Acil Alım Tabanı',
    'wiz.step3.max': 'Konsinye Bırakma Fiyatı',
    'wiz.step3.range': 'Piyasa Kıyaslama Değer Aralığı',
    'wiz.step3.confidence': 'Güvenlik Skoru',
    'wiz.step3.confidence.desc': 'Fiyatlandırma verisinin isabet derecesini ve güven endeksini ifade eder.',
    'wiz.step3.formula': 'Fiyatlandırma Metodolojisi ve Formül Analizi',
    'wiz.step3.formula.desc': 'Bu hesaplama, yasal otomotiv entegrasyon kılavuzlarındaki standart ikinci el fiyatlama formülüne göre yapay zeka tarafından hesaplanmıştır.',
    'wiz.step3.formula.used': 'Kullanılan Fiyatlama Formülü',
    'wiz.step3.formula.base': 'P_0km (Sıfır Fiyatı)',
    'wiz.step3.formula.yas': 'delta_yas (Yaş Skoru)',
    'wiz.step3.formula.km': 'delta_km (Km Skoru)',
    'wiz.step3.formula.donanim': 'gamma_donanim (Paket)',
    'wiz.step3.formula.pazar': 'epsilon_pazar (Sapma)',
    'wiz.step3.ai': 'Yapay Zeka Analiz Notları',
    'wiz.step3.listings': 'Piyasadaki Benzer İlanlar',
    'wiz.step3.listings.date': 'İlan Tarihi',
    'wiz.step3.listings.price': 'İlan Fiyatı',
    'wiz.step3.listings.img': 'Araç Görseli',
    'wiz.step3.banner.title': 'Aracınızı Dükkanımıza Konsinye Bırakarak Satın',
    'wiz.step3.banner.desc': 'Aracınızı galerimize emanet bırakın, profesyonel ekibimiz ve ilan ağımız ile hedef fiyata en kısa sürede satalım.',
    'wiz.step3.banner.btn': 'Dükkana Konsinye Bırak',
    'wiz.step3.new': 'Yeni Değerleme Başlat',
    
    // Consignment Wizard
    'con.title': 'Konsinye Başvuru Formu',
    'con.desc': 'Aracınızı profesyonel ekibimiz vasıtasıyla hızlıca satmak için iletişim bilgilerinizi iletin.',
    'con.details': 'Değerleme Detayları',
    'con.personal': 'Kişisel Bilgiler',
    'con.firstname': 'Ad',
    'con.lastname': 'Soyad',
    'con.phone': 'Telefon Numarası',
    'con.email': 'E-posta Adresi',
    'con.province': 'Şehir',
    'con.district': 'İlçe',
    'con.preferred': 'Tercih Edilen İletişim Kanalı',
    'con.submit': 'Başvuruyu Tamamla',
    'con.success': 'Başvurunuz Alındı!',
    'con.success.desc': 'Konsinye başvurunuz başarıyla kaydedilmiştir. Uzman ekibimiz en kısa sürede sizinle iletişime geçecektir.',
    'con.success.home': 'Ana Sayfaya Dön',
  },
  en: {
    // Navbar & Common
    'nav.brand': 'NAKIT GARAJ',
    'nav.home': 'Home',
    'nav.valuation': 'Valuation',
    'nav.consignment': 'Consignment',
    'nav.admin': 'Admin Panel',
    'nav.logout': 'Log Out',
    
    // Footer
    'footer.desc': 'Turkey\'s AI-powered, transparent and reliable automotive marketplace valuation and consignment platform.',
    'footer.rights': 'All rights reserved.',
    
    // Homepage
    'home.badge': 'AI-Powered Automotive Platform',
    'home.title': 'Find Your Car\'s True Value In Seconds',
    'home.subtitle': 'Evaluate your vehicle transparently with our AI algorithm using licensed database variables from Cardata, Indicata, and Data Deger.',
    'home.card1.title': 'Smart Vehicle Valuation',
    'home.card1.desc': 'Calculate real-time market value based on mileage, damage status, package options, and regional market demand.',
    'home.card1.button': 'Start Valuation Now',
    'home.card2.title': 'Consignment Service',
    'home.card2.desc': 'Hand over your vehicle to our professional sales team, secure garage, and listing networks to sell it quickly at its fair value.',
    'home.card2.button': 'Submit Consignment Application',
    
    // Valuation Wizard Step 1
    'wiz.step1.title': 'Vehicle Identification',
    'wiz.step1.desc': 'Select the basic specifications of your vehicle from the list.',
    'wiz.select': 'Select',
    'wiz.year': 'Model Year',
    'wiz.brand': 'Brand',
    'wiz.model': 'Model',
    'wiz.variant': 'Version / Engine',
    'wiz.package': 'Hardware Package',
    'wiz.body': 'Body Type',
    'wiz.fuel': 'Fuel Type',
    'wiz.transmission': 'Transmission Type',
    
    // Valuation Wizard Step 2
    'wiz.step2.title': 'Vehicle Condition Info',
    'wiz.step2.desc': 'Enter license plate, mileage, and damage status.',
    'wiz.plate': 'License Plate',
    'wiz.mileage': 'Mileage (km)',
    'wiz.color': 'Color',
    'wiz.damage': 'Is There Any Damage Record?',
    'wiz.damage.no': 'No',
    'wiz.damage.yes': 'Yes',
    'wiz.damage.unknown': 'Unknown',
    'wiz.kvkk.checkbox': 'I agree to the processing and saving of my vehicle data for valuation purposes under the KVKK Privacy Agreement.',
    'wiz.kvkk.link': 'KVKK Privacy Agreement',
    'wiz.back': 'Back',
    'wiz.next': 'Next',
    'wiz.calculate': 'Calculate Valuation',
    
    // Valuation Wizard Step 3
    'wiz.step3.title': 'NakitGaraj Offer & Market Analysis',
    'wiz.step3.offer': 'NakitGaraj Instant Cash Offer',
    'wiz.step3.fair': 'Sahibinden Market Listing Value',
    'wiz.step3.quick': 'Quick Urgent Purchase Offer',
    'wiz.step3.max': 'Consignment Target Sale Price',
    'wiz.step3.range': 'Market Comparison Range',
    'wiz.step3.confidence': 'Confidence Score',
    'wiz.step3.confidence.desc': 'Represents the accuracy rate and confidence index of the pricing data.',
    'wiz.step3.formula': 'Pricing Methodology & Formula Analysis',
    'wiz.step3.formula.desc': 'This calculation is computed by AI using the standard second-hand pricing formula in legal automotive integration guidelines.',
    'wiz.step3.formula.used': 'Pricing Formula Used',
    'wiz.step3.formula.base': 'P_0km (Base MSRP)',
    'wiz.step3.formula.yas': 'delta_yas (Age Penalty)',
    'wiz.step3.formula.km': 'delta_km (Km Penalty)',
    'wiz.step3.formula.donanim': 'gamma_donanim (Package)',
    'wiz.step3.formula.pazar': 'epsilon_pazar (Deviation)',
    'wiz.step3.ai': 'AI Analysis Remarks',
    'wiz.step3.listings': 'Comparable Listings on Market',
    'wiz.step3.listings.date': 'Listing Date',
    'wiz.step3.listings.price': 'Listing Price',
    'wiz.step3.listings.img': 'Vehicle Image',
    'wiz.step3.banner.title': 'Sell Your Car with NakitGaraj Assurance',
    'wiz.step3.banner.desc': 'Submit a consignment application in seconds using your valuation data. We will display your car in our secure garage and sell it fast.',
    'wiz.step3.banner.btn': 'Apply for Consignment',
    'wiz.step3.new': 'Start New Valuation',
    
    // Consignment Wizard
    'con.title': 'Consignment Application Form',
    'con.desc': 'Provide your contact information to sell your vehicle quickly through our professional sales team.',
    'con.details': 'Valuation Details',
    'con.personal': 'Personal Information',
    'con.firstname': 'First Name',
    'con.lastname': 'Last Name',
    'con.phone': 'Phone Number',
    'con.email': 'Email Address',
    'con.province': 'Province',
    'con.district': 'District',
    'con.preferred': 'Preferred Communication Channel',
    'con.submit': 'Complete Application',
    'con.success': 'Application Received!',
    'con.success.desc': 'Your consignment application has been successfully saved. Our team will contact you as soon as possible.',
    'con.success.home': 'Return to Homepage',
  }
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('tr');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedLang = localStorage.getItem('language') as Language | null;
    if (storedLang) {
      setLanguageState(storedLang);
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations['tr']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
