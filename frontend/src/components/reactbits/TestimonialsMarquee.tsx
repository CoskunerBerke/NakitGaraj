'use client';

import React from 'react';
import { Star, MessageSquareQuote, MapPin, CheckCircle2 } from 'lucide-react';
import ShinyText from './ShinyText';

interface Review {
  id: number;
  name: string;
  location: string;
  car: string;
  comment: string;
  rating: number;
  date: string;
  verified: boolean;
}

const REVIEWS_TR: Review[] = [
  {
    id: 1,
    name: 'Mert Selim E.',
    location: 'İstanbul, Kadıköy',
    car: '2020 Toyota Corolla 1.8 Hybrid',
    comment:
      'Galeriler ve al-satçılar aracım için çok komik rakamlar vermişti. NakitGaraj tam piyasa değerinin bir tık altına net teklif yaptı. 2 saat içinde noter işlemleri bitti, nakit hesabıma yattı. Hız mükemmel!',
    rating: 5,
    date: '2 gün önce',
    verified: true,
  },
  {
    id: 2,
    name: 'Burcu T.',
    location: 'Ankara, Çankaya',
    car: '2023 Togg T10X V2',
    comment:
      'Togg aracımın piyasa değerini merak edip değerleme aldım. Hem ekspertiz durumuna göre düşüşleri hem de piyasa ortalamasını çok net gösterdi. Konsinye sistemine bıraktım, 4 günde değerinde satıldı.',
    rating: 5,
    date: '3 gün önce',
    verified: true,
  },
  {
    id: 3,
    name: 'Hakan K.',
    location: 'İzmir, Karşıyaka',
    car: '2021 Volkswagen Golf 1.5 TSI',
    comment:
      'Plakayı ve kilometreyi girdiğim gibi anında teklif verdi. Noter randevusunu bile kendileri organize etti, kapıma kadar gelip aracı teslim aldılar. Şeffaf ve çok pratik bir hizmet.',
    rating: 5,
    date: '5 gün önce',
    verified: true,
  },
  {
    id: 4,
    name: 'Selin A.',
    location: 'Bursa, Nilüfer',
    car: '2019 Renault Megane 1.5 dCi',
    comment:
      'İkinci el araba satarken telefon aramalarıyla ve garip takas teklifleriyle uğraşmak istemiyordum. Konsinye bırakma hizmeti tam aradığım şeymiş. Teşekkürler NakitGaraj ekibi!',
    rating: 5,
    date: '1 hafta önce',
    verified: true,
  },
  {
    id: 5,
    name: 'Emre C.',
    location: 'Kocaeli, İzmit',
    car: '2022 BMW 320i Sedan',
    comment:
      'Değerleme raporunda verilen fiyat teklifi piyasa şartlarına kıyasla çok dürüst ve mantıklıydı. Hiç zaman kaybetmeden araç satışımı tamamladım. Kesinlikle tavsiye ederim.',
    rating: 5,
    date: '1 hafta önce',
    verified: true,
  },
  {
    id: 6,
    name: 'Ömer Faruk B.',
    location: 'Antalya, Muratpaşa',
    car: '2018 Honda Civic 1.6 VTEC',
    comment:
      'Satış sürecindeki dürüstlük ve profesyonellik beni çok etkiledi. Ekspertiz sonrası ne teklif edildiyse kuruşu kuruşuna ödendi, hiçbir son dakika sürprizi yaşamadım.',
    rating: 5,
    date: '2 hafta önce',
    verified: true,
  },
];

const REVIEWS_EN: Review[] = [
  {
    id: 1,
    name: 'Mert Selim E.',
    location: 'Istanbul, Kadikoy',
    car: '2020 Toyota Corolla 1.8 Hybrid',
    comment:
      'Local dealers offered unrealistically low prices for my car. NakitGaraj made a transparent offer just slightly below market average. Funds were transferred in under 2 hours. Incredible speed!',
    rating: 5,
    date: '2 days ago',
    verified: true,
  },
  {
    id: 2,
    name: 'Burcu T.',
    location: 'Ankara, Cankaya',
    car: '2023 Togg T10X V2',
    comment:
      'Checked valuation for my Togg T10X. It accurately detailed market price ranges and condition factors. Placed it on consignment and sold it within 4 days at a great price.',
    rating: 5,
    date: '3 days ago',
    verified: true,
  },
  {
    id: 3,
    name: 'Hakan K.',
    location: 'Izmir, Karsiyaka',
    car: '2021 Volkswagen Golf 1.5 TSI',
    comment:
      'Got an instant valuation right after entering plate and mileage. They even arranged the notary appointment and handled everything seamlessly. Transparent and practical service.',
    rating: 5,
    date: '5 days ago',
    verified: true,
  },
  {
    id: 4,
    name: 'Selin A.',
    location: 'Bursa, Nilufer',
    car: '2019 Renault Megane 1.5 dCi',
    comment:
      'Did not want to deal with endless buyer phone calls or random trade requests. The consignment option was exactly what I needed. Thanks NakitGaraj team!',
    rating: 5,
    date: '1 week ago',
    verified: true,
  },
];

interface TestimonialsMarqueeProps {
  language?: string;
}

export default function TestimonialsMarquee({ language = 'tr' }: TestimonialsMarqueeProps) {
  const reviews = language === 'tr' ? REVIEWS_TR : REVIEWS_EN;
  // Duplicate array 3 times for completely seamless infinite loop
  const marqueeItems = [...reviews, ...reviews, ...reviews];

  return (
    <section className="w-full py-16 md:py-24 overflow-hidden relative border-t border-zinc-200/60 dark:border-white/5 bg-zinc-50/50 dark:bg-black/20">
      {/* Section Header */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 text-center flex flex-col items-center gap-3 mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-orange/10 border border-brand-orange/20 text-brand-orange text-xs font-bold tracking-wider uppercase">
          <MessageSquareQuote className="w-4 h-4" />
          <span>{language === 'tr' ? 'Gerçek Kullanıcı Deneyimleri' : 'Real Customer Experiences'}</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-black text-zinc-900 dark:text-white tracking-tight">
          {language === 'tr' ? (
            <>
              MÜŞTERİ <ShinyText text="YORUMLARI" speed={4} className="font-black" />
            </>
          ) : (
            <>
              CUSTOMER <ShinyText text="REVIEWS" speed={4} className="font-black" />
            </>
          )}
        </h2>
        <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
          {language === 'tr'
            ? 'NakitGaraj üzerinden aracını satan ve konsinye hizmetinden yararlanan müşterilerimizin tarafsız görüşleri.'
            : 'Unbiased feedback from customers who sold their vehicles or used consignment with NakitGaraj.'}
        </p>
      </div>

      {/* Infinite Left-to-Right Marquee Slider */}
      {/* CRITICAL REQUIREMENT: NO HOVER PAUSE! Hovering with mouse cursor MUST NOT STOP THE ANIMATION. */}
      <div className="relative w-full overflow-hidden flex select-none py-4">
        {/* Gradient edge masks for smooth fade out */}
        <div className="absolute top-0 bottom-0 left-0 w-24 md:w-40 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-0 w-24 md:w-40 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <div className="flex gap-6 animate-marquee-ltr min-w-full shrink-0">
          {marqueeItems.map((rev, index) => (
            <div
              key={`${rev.id}-${index}`}
              className="w-[320px] sm:w-[380px] shrink-0 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800/80 shadow-md shadow-zinc-200/30 dark:shadow-none flex flex-col justify-between gap-4 bg-white dark:bg-zinc-900 transform-gpu"
            >
              {/* Top rating & verified tag */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                {rev.verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                    <CheckCircle2 className="w-3 h-3" />
                    {language === 'tr' ? 'Doğrulanmış Müşteri' : 'Verified Owner'}
                  </span>
                )}
              </div>

              {/* Comment body */}
              <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal italic">
                "{rev.comment}"
              </p>

              {/* Vehicle & User info */}
              <div className="pt-3 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between text-xs">
                <div className="flex flex-col">
                  <span className="font-bold text-zinc-900 dark:text-white">{rev.name}</span>
                  <span className="text-[11px] font-medium text-brand-orange mt-0.5">{rev.car}</span>
                </div>
                <div className="flex flex-col items-end text-[10px] text-zinc-400">
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3 text-zinc-400" />
                    {rev.location}
                  </span>
                  <span className="mt-0.5 text-zinc-400">{rev.date}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
