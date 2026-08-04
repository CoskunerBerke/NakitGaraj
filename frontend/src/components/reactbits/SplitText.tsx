'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface SplitTextProps {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  mode?: 'words' | 'chars';
}

export default function SplitText({
  text,
  className = '',
  delay = 0,
  stagger = 0.04,
  mode = 'words',
}: SplitTextProps) {
  const items = mode === 'words' ? text.split(' ') : text.split('');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: stagger,
      },
    },
  };

  const itemVariants = {
    hidden: {
      opacity: 0,
      y: 20,
      filter: 'blur(8px)',
    },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring' as const,
        damping: 18,
        stiffness: 90,
      },
    },
  };

  return (
    <motion.span
      className={`inline-flex flex-wrap ${mode === 'chars' ? 'gap-0' : 'gap-[0.25em]'} ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map((item, idx) => (
        <motion.span
          key={idx}
          className="inline-block whitespace-pre"
          variants={itemVariants}
        >
          {item}
          {mode === 'words' && idx < items.length - 1 ? '' : ''}
        </motion.span>
      ))}
    </motion.span>
  );
}
