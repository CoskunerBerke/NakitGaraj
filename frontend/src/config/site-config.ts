/**
 * NakitGaraj Whitelabel & SaaS Brand Configuration System
 * --------------------------------------------------------
 * Bu dosya projenin başka oto galerilerine veya kurumsal müşterilere
 * kolayca özelleştirilip satılabilmesini sağlar.
 * 
 * NakitGaraj varsayılan ve çalışan orijinal marka konfigürasyonudur.
 */

export interface SiteConfig {
  brandName: string;
  legalTitle: string;
  tagline: string;
  logoText: string;
  logoUrl?: string; // Özel logo resmi yüklendiğinde kullanılır
  domain: string;
  supportPhone: string;
  supportEmail: string;
  address: string;
  theme: {
    primaryColor: string; // Ana Marka Rengi (Örn: NakitGaraj Turuncusu #FF5722)
    accentColor: string;  // İkincil Vurgu Rengi (Örn: Emerald #10B981)
    darkBg: string;
  };
  features: {
    enableAiEvaluation: boolean;
    enableConsignment: boolean;
    enableTelegramNotifications: boolean;
    enableWhatsAppChat: boolean;
  };
}

export const siteConfig: SiteConfig = {
  brandName: process.env.NEXT_PUBLIC_BRAND_NAME || 'NakitGaraj',
  legalTitle: process.env.NEXT_PUBLIC_LEGAL_TITLE || 'NakitGaraj Otomotiv Teknolojileri A.Ş.',
  tagline: process.env.NEXT_PUBLIC_TAGLINE || 'Türkiye\'nin Yapay Zeka Destekli Anında Araç Değerleme ve Konsinye Platformu',
  logoText: process.env.NEXT_PUBLIC_LOGO_TEXT || 'NakitGaraj',
  domain: process.env.NEXT_PUBLIC_DOMAIN || 'localhost:3000',
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || '05350379074',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'destek@nakitgaraj.com',
  address: process.env.NEXT_PUBLIC_ADDRESS || 'Ankara / Yenimahalle',
  theme: {
    primaryColor: process.env.NEXT_PUBLIC_PRIMARY_COLOR || '#FF5722',
    accentColor: process.env.NEXT_PUBLIC_ACCENT_COLOR || '#10B981',
    darkBg: '#09090B',
  },
  features: {
    enableAiEvaluation: true,
    enableConsignment: true,
    enableTelegramNotifications: true,
    enableWhatsAppChat: true,
  },
};
