'use client';

import React from 'react';
import { motion } from 'framer-motion';

export default function LightWavesBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {/* Light Mesh Grid Pattern for Clean Bright Theme */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb25_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb25_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      {/* Dynamic Animated Ambient Light Orbs */}
      <motion.div
        animate={{
          x: [0, 40, 0],
          y: [0, -30, 0],
          scale: [1, 1.15, 1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-[-5%] left-[20%] w-[600px] h-[600px] bg-gradient-to-tr from-brand-orange/15 via-amber-300/10 to-rose-300/10 rounded-full blur-[140px]"
      />

      <motion.div
        animate={{
          x: [0, -50, 0],
          y: [0, 40, 0],
          scale: [1.1, 1, 1.1],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-[25%] right-[10%] w-[650px] h-[650px] bg-gradient-to-br from-rose-500/10 via-amber-200/15 to-brand-orange/10 rounded-full blur-[160px]"
      />
    </div>
  );
}
