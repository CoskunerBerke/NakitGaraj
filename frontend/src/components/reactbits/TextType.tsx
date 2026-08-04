'use client';

import React, { useState, useEffect } from 'react';

interface TextTypeProps {
  text: string[];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDuration?: number;
  loop?: boolean;
  cursorChar?: string;
  className?: string;
  cursorClassName?: string;
  showCursor?: boolean;
}

export default function TextType({
  text,
  typingSpeed = 70,
  deletingSpeed = 40,
  pauseDuration = 2000,
  loop = true,
  cursorChar = '|',
  className = '',
  cursorClassName = '',
  showCursor = true,
}: TextTypeProps) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!text || text.length === 0) return;

    const currentFullText = text[currentTextIndex];

    const handleTyping = () => {
      if (!isDeleting) {
        // Typing forward
        if (displayedText.length < currentFullText.length) {
          setDisplayedText(currentFullText.slice(0, displayedText.length + 1));
        } else {
          // Finished typing current phrase -> pause before deleting if looping or multiple phrases
          if (loop || currentTextIndex < text.length - 1) {
            setTimeout(() => setIsDeleting(true), pauseDuration);
          }
        }
      } else {
        // Deleting backward
        if (displayedText.length > 0) {
          setDisplayedText(currentFullText.slice(0, displayedText.length - 1));
        } else {
          // Finished deleting -> move to next text
          setIsDeleting(false);
          setCurrentTextIndex((prev) => (prev + 1) % text.length);
        }
      }
    };

    const timer = setTimeout(
      handleTyping,
      isDeleting ? deletingSpeed : typingSpeed
    );

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, currentTextIndex, text, typingSpeed, deletingSpeed, pauseDuration, loop]);

  return (
    <span className={`inline-flex items-center ${className}`}>
      <span>{displayedText || '\u00A0'}</span>
      {showCursor && (
        <span
          className={`ml-0.5 inline-block font-mono font-bold animate-cursor-blink text-brand-orange ${cursorClassName}`}
        >
          {cursorChar}
        </span>
      )}
    </span>
  );
}
