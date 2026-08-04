'use client';

import React from 'react';

export type PartStatus = 'ORIJINAL' | 'LOKAL' | 'BOYALI' | 'DEGISEN' | string;

export interface RealisticCarDamageSchematicProps {
  paintScheme: Record<string, PartStatus | string>;
  onPartClick?: (partName: string) => void;
  interactive?: boolean;
}

const STATUS_COLORS: Record<string, { fill: string; stroke: string; label: string; bgClass: string; textClass: string }> = {
  ORIJINAL: {
    fill: '#cdd5e0', // Exact light metallic grey-blue
    stroke: '#b0bccb',
    label: 'Orijinal',
    bgClass: 'bg-zinc-200 dark:bg-zinc-700',
    textClass: 'text-zinc-700 dark:text-zinc-300',
  },
  LOKAL: {
    fill: '#ff6b00', // Bright Orange
    stroke: '#ea580c',
    label: 'Lokal Boyalı',
    bgClass: 'bg-orange-500/20',
    textClass: 'text-orange-600 dark:text-orange-400',
  },
  BOYALI: {
    fill: '#1a69ff', // Electric Blue
    stroke: '#0052e0',
    label: 'Boyalı',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-600 dark:text-blue-400',
  },
  DEGISEN: {
    fill: '#e62e2e', // Deep Red
    stroke: '#cc1f1f',
    label: 'Değişen',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-600 dark:text-red-400',
  },
};

export default function RealisticCarDamageSchematic({
  paintScheme,
  onPartClick,
  interactive = false,
}: RealisticCarDamageSchematicProps) {
  const getPartFill = (partName: string) => {
    const status = paintScheme[partName] || 'ORIJINAL';
    return STATUS_COLORS[status]?.fill || STATUS_COLORS.ORIJINAL.fill;
  };

  const getPartStroke = (partName: string) => {
    const status = paintScheme[partName] || 'ORIJINAL';
    return STATUS_COLORS[status]?.stroke || STATUS_COLORS.ORIJINAL.stroke;
  };

  const nonOriginalParts = Object.entries(paintScheme).filter(
    ([_, status]) => status && status !== 'ORIJINAL'
  );

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full p-6 bg-white dark:bg-zinc-950 rounded-3xl border border-zinc-200 dark:border-white/10 shadow-xs overflow-hidden">
      
      {/* Color Legend Bar */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-bold font-mono whitespace-nowrap w-full">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-3.5 h-3.5 rounded bg-[#cdd5e0] border border-[#b0bccb] inline-block" />
          <span className="text-zinc-600 dark:text-zinc-300">Orijinal</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-3.5 h-3.5 rounded bg-[#ff6b00] border border-[#e05e00] inline-block" />
          <span className="text-orange-600 dark:text-orange-400">Lokal Boyalı</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-3.5 h-3.5 rounded bg-[#1a69ff] border border-[#0052e0] inline-block" />
          <span className="text-blue-600 dark:text-blue-400">Boyalı</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-3.5 h-3.5 rounded bg-[#e62e2e] border border-[#cc1f1f] inline-block" />
          <span className="text-red-600 dark:text-red-400">Değişen</span>
        </div>
      </div>

      {/* Large Crisp High-Definition Vector Car Illustration */}
      <div className="relative flex items-center justify-center py-2">
        <svg className="w-80 h-[420px] drop-shadow-md" viewBox="0 0 320 440" fill="none" xmlns="http://www.w3.org/2000/svg">
          
          {/* 4 Large Wheels (Tires) */}
          <circle cx="48" cy="100" r="24" fill="#cdd5e0" stroke="#ffffff" strokeWidth="3" />
          <circle cx="272" cy="100" r="24" fill="#cdd5e0" stroke="#ffffff" strokeWidth="3" />
          <circle cx="48" cy="320" r="24" fill="#cdd5e0" stroke="#ffffff" strokeWidth="3" />
          <circle cx="272" cy="320" r="24" fill="#cdd5e0" stroke="#ffffff" strokeWidth="3" />

          {/* 1. Ön Tampon (Top Bumper) */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Ön Tampon')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <rect x="110" y="16" width="100" height="28" rx="8" fill={getPartFill('Ön Tampon')} stroke={getPartStroke('Ön Tampon')} strokeWidth="2" />
            <path d="M 120 26 C 126 22, 134 22, 140 26 C 134 30, 126 30, 120 26 Z" fill="#ffffff" />
            <path d="M 200 26 C 194 22, 186 22, 180 26 C 186 30, 194 30, 200 26 Z" fill="#ffffff" />
          </g>

          {/* 2. Motor Kaputu (Hood) */}
          <path
            d="M 108 50 C 130 46, 190 46, 212 50 L 218 138 C 178 130, 142 130, 102 138 Z"
            fill={getPartFill('Motor Kaputu')}
            stroke={getPartStroke('Motor Kaputu')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Motor Kaputu')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* Ön Cam (Windshield) */}
          <path d="M 102 140 C 142 132, 178 132, 218 140 L 212 198 C 175 190, 145 190, 108 198 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />

          {/* 3. Tavan (Roof) */}
          <path
            d="M 108 200 C 145 192, 175 192, 212 200 L 212 288 C 175 296, 145 296, 108 288 Z"
            fill={getPartFill('Tavan')}
            stroke={getPartStroke('Tavan')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Tavan')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* Arka Cam (Rear Glass) */}
          <path d="M 108 290 C 145 298, 175 298, 212 290 L 218 348 C 178 356, 142 356, 102 348 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />

          {/* 4. Bagaj (Trunk) */}
          <path
            d="M 102 350 C 142 358, 178 358, 218 350 L 212 384 C 190 390, 130 390, 108 384 Z"
            fill={getPartFill('Bagaj')}
            stroke={getPartStroke('Bagaj')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Bagaj')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* 5. Arka Tampon (Bottom Bumper) */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Arka Tampon')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <rect x="110" y="394" width="100" height="28" rx="8" fill={getPartFill('Arka Tampon')} stroke={getPartStroke('Arka Tampon')} strokeWidth="2" />
            <rect x="124" y="404" width="18" height="8" rx="3" fill="#ffffff" />
            <rect x="178" y="404" width="18" height="8" rx="3" fill="#ffffff" />
          </g>

          {/* Left Side Profile */}
          {/* 6. Sol Ön Çamurluk */}
          <path
            d="M 52 40 L 58 40 L 58 46 L 52 46 L 52 76 A 24 24 0 0 0 52 124 L 52 128 L 88 134 C 82 100, 72 68, 52 40 Z"
            fill={getPartFill('Sol Ön Çamurluk')}
            stroke={getPartStroke('Sol Ön Çamurluk')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Sol Ön Çamurluk')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* 7. Sol Ön Kapı */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Sol Ön Kapı')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <path
              d="M 52 128 L 88 134 C 96 160, 102 188, 102 210 L 52 210 L 52 128 Z"
              fill={getPartFill('Sol Ön Kapı')}
              stroke={getPartStroke('Sol Ön Kapı')}
              strokeWidth="2"
            />
            <path d="M 58 134 L 82 140 L 92 204 L 58 204 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />
          </g>

          {/* 8. Sol Arka Kapı */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Sol Arka Kapı')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <path
              d="M 52 212 L 102 212 C 102 236, 96 268, 88 290 L 52 290 L 52 212 Z"
              fill={getPartFill('Sol Arka Kapı')}
              stroke={getPartStroke('Sol Arka Kapı')}
              strokeWidth="2"
            />
            <path d="M 58 218 L 92 218 L 82 284 L 58 284 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />
          </g>

          {/* 9. Sol Arka Çamurluk */}
          <path
            d="M 52 290 L 88 290 C 72 320, 60 350, 52 384 L 58 384 L 58 378 L 52 378 L 52 344 A 24 24 0 0 0 52 296 L 52 290 Z"
            fill={getPartFill('Sol Arka Çamurluk')}
            stroke={getPartStroke('Sol Arka Çamurluk')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Sol Arka Çamurluk')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* Right Side Profile */}
          {/* 10. Sağ Ön Çamurluk */}
          <path
            d="M 268 40 L 262 40 L 262 46 L 268 46 L 268 76 A 24 24 0 0 1 268 124 L 268 128 L 232 134 C 238 100, 248 68, 268 40 Z"
            fill={getPartFill('Sağ Ön Çamurluk')}
            stroke={getPartStroke('Sağ Ön Çamurluk')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Sağ Ön Çamurluk')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />

          {/* 11. Sağ Ön Kapı */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Sağ Ön Kapı')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <path
              d="M 268 128 L 232 134 C 224 160, 218 188, 218 210 L 268 210 L 268 128 Z"
              fill={getPartFill('Sağ Ön Kapı')}
              stroke={getPartStroke('Sağ Ön Kapı')}
              strokeWidth="2"
            />
            <path d="M 262 134 L 238 140 L 228 204 L 262 204 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />
          </g>

          {/* 12. Sağ Arka Kapı */}
          <g
            onClick={() => interactive && onPartClick && onPartClick('Sağ Arka Kapı')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          >
            <path
              d="M 268 212 L 218 212 C 218 236, 224 268, 232 290 L 268 290 L 268 212 Z"
              fill={getPartFill('Sağ Arka Kapı')}
              stroke={getPartStroke('Sağ Arka Kapı')}
              strokeWidth="2"
            />
            <path d="M 262 218 L 228 218 L 238 284 L 262 284 Z" fill="#ffffff" stroke="#b0bccb" strokeWidth="1.5" />
          </g>

          {/* 13. Sağ Arka Çamurluk */}
          <path
            d="M 268 290 L 232 290 C 248 320, 260 350, 268 384 L 262 384 L 262 378 L 268 378 L 268 344 A 24 24 0 0 1 268 296 L 268 290 Z"
            fill={getPartFill('Sağ Arka Çamurluk')}
            stroke={getPartStroke('Sağ Arka Çamurluk')}
            strokeWidth="2"
            onClick={() => interactive && onPartClick && onPartClick('Sağ Arka Çamurluk')}
            className={interactive ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''}
          />
        </svg>
      </div>

      {/* Summary Box */}
      <div className="w-full text-xs">
        {nonOriginalParts.length === 0 ? (
          <div className="flex flex-col gap-1.5 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10">
            <span className="font-extrabold text-zinc-800 dark:text-zinc-200 flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded bg-[#cdd5e0] inline-block" /> Orijinal
            </span>
            <p className="text-zinc-500 dark:text-zinc-400 leading-normal text-[11px]">
              • Aracın tüm parçaları orijinaldir. Değişen ve boyalı parçası bulunmamaktadır.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-white/10">
            <span className="font-extrabold text-zinc-900 dark:text-white text-xs flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block" /> Ekspertiz Hasar Özeti:
            </span>
            <div className="flex flex-col gap-1.5 divide-y divide-zinc-200/60 dark:divide-white/5 pt-1">
              {nonOriginalParts.map(([part, status]) => {
                const conf = STATUS_COLORS[status] || STATUS_COLORS.ORIJINAL;
                return (
                  <div key={part} className="flex items-center justify-between pt-1.5 text-[11px]">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{part}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${conf.bgClass} ${conf.textClass}`}>
                      {conf.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
