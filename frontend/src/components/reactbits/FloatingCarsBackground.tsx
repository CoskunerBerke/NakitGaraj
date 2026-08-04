'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface CarItem {
  id: number;
  brand: string;
  model: string;
  year: number;
  logo: string;
  carSvg: string;
  direction: 'left-to-right' | 'right-to-left';
  topPercent: number;
  duration: number;
  delay: number;
}

const CARS: CarItem[] = [
  {
    id: 1,
    brand: 'Audi',
    model: 'A3 Sedan',
    year: 2025,
    logo: 'https://cdn.simpleicons.org/audi/F00000',
    carSvg: '/cars/audi_a3.svg',
    direction: 'left-to-right',
    topPercent: 12,
    duration: 22,
    delay: 0,
  },
  {
    id: 2,
    brand: 'BMW',
    model: '320i M Sport',
    year: 2024,
    logo: 'https://cdn.simpleicons.org/bmw/0066B1',
    carSvg: '/cars/bmw_3series.svg',
    direction: 'right-to-left',
    topPercent: 28,
    duration: 26,
    delay: 2,
  },
  {
    id: 3,
    brand: 'Mercedes-Benz',
    model: 'C200d AMG',
    year: 2024,
    logo: 'https://cdn.simpleicons.org/mercedes/000000',
    carSvg: '/cars/mercedes_cclass.svg',
    direction: 'left-to-right',
    topPercent: 44,
    duration: 21,
    delay: 4,
  },
  {
    id: 4,
    brand: 'Porsche',
    model: '911 Carrera S',
    year: 2025,
    logo: 'https://cdn.simpleicons.org/porsche/D5001C',
    carSvg: '/cars/porsche_911.svg',
    direction: 'right-to-left',
    topPercent: 60,
    duration: 18,
    delay: 1,
  },
  {
    id: 5,
    brand: 'Volkswagen',
    model: 'Golf GTi',
    year: 2023,
    logo: 'https://cdn.simpleicons.org/volkswagen/001E50',
    carSvg: '/cars/vw_golf.svg',
    direction: 'left-to-right',
    topPercent: 76,
    duration: 24,
    delay: 3,
  },
];

export default function FloatingCarsBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Light Mesh Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb25_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb25_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_10%,#000_80%,transparent_100%)]" />

      {/* Floating Driving Cars Across Screen */}
      {CARS.map((car) => {
        const isLeftToRight = car.direction === 'left-to-right';
        const startX = isLeftToRight ? '-25vw' : '110vw';
        const endX = isLeftToRight ? '110vw' : '-25vw';

        return (
          <motion.div
            key={car.id}
            initial={{ x: startX, opacity: 0 }}
            animate={{
              x: [startX, endX],
              opacity: [0, 0.95, 0.95, 0],
              y: [0, -6, 0, 6, 0],
            }}
            transition={{
              x: {
                duration: car.duration,
                repeat: Infinity,
                ease: 'linear',
                delay: car.delay,
              },
              y: {
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              },
              opacity: {
                duration: car.duration,
                repeat: Infinity,
                ease: 'linear',
                delay: car.delay,
                times: [0, 0.08, 0.92, 1],
              },
            }}
            style={{
              top: `${car.topPercent}%`,
              willChange: 'transform, opacity',
            }}
            className="absolute flex items-center gap-3.5 px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/90 dark:border-white/10 shadow-xl shadow-zinc-200/60 dark:shadow-none backdrop-blur-xl z-10 w-max whitespace-nowrap"
          >
            {/* Speed Light Trail */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-28 h-1 rounded-full bg-gradient-to-r ${
                isLeftToRight
                  ? 'from-transparent via-brand-orange/35 to-brand-orange right-full'
                  : 'from-brand-orange via-brand-orange/35 to-transparent left-full'
              }`}
            />

            {/* Brand Logo */}
            <div className="w-7 h-7 shrink-0 flex items-center justify-center p-1 rounded-xl bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-white/10 shadow-sm">
              <img
                src={car.logo}
                alt={car.brand}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            </div>

            {/* Local High-Quality Photorealistic Vector Side Render */}
            <div className="w-16 h-8 shrink-0 flex items-center justify-center">
              <img
                src={car.carSvg}
                alt={`${car.brand} ${car.model}`}
                className={`w-full h-full object-contain filter drop-shadow-md ${
                  !isLeftToRight ? 'scale-x-[-1]' : ''
                }`}
              />
            </div>

            {/* Car Brand & Model Badge */}
            <div className="flex flex-col text-left pr-1">
              <span className="text-xs font-black text-zinc-900 dark:text-white tracking-tight leading-tight">
                {car.brand} {car.model}
              </span>
              <span className="text-[10px] text-zinc-400 font-mono font-semibold">
                {car.year} Model
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
