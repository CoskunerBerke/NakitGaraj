import { createCanvas, loadImage } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';

export interface TelegramCardData {
  licensePlate?: string;
  vehicleName: string;
  brandName?: string;
  modelName?: string;
  variantName?: string;
  bodyType?: string;
  year?: number | string;
  transmission?: string;
  fuel?: string;
  color?: string;
  mileage: number;
  tramerAmount?: string | number;
  damageStatus?: string;
  paintScheme?: Record<string, string>;
  chassisStatus?: {
    rightChassisOriginal?: boolean;
    leftChassisOriginal?: boolean;
    trunkFloorOriginal?: boolean;
  };
  firstName?: string;
  lastName?: string;
  phone?: string;
  finalOfferedPrice: number;
  fairMarketValue?: number;
  finalConsignmentPrice?: number;
}

function getBaseSchematicBuffer(): Buffer | null {
  const possiblePaths = [
    path.join(__dirname, '../../assets/car_damage_schematic.jpg'),
    path.join(__dirname, '../../../backend/assets/car_damage_schematic.jpg'),
    path.join(process.cwd(), 'assets/car_damage_schematic.jpg'),
    path.join(process.cwd(), 'backend/assets/car_damage_schematic.jpg'),
    path.join(process.cwd(), 'frontend/public/images/car_damage_schematic.jpg'),
    'C:/Users/berke/OneDrive/Masaüstü/Büyük proje/backend/assets/car_damage_schematic.jpg',
    'C:/Users/berke/OneDrive/Masaüstü/Büyük proje/frontend/public/images/car_damage_schematic.jpg',
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p);
    }
  }
  return null;
}

export async function generateTelegramCardBuffer(data: TelegramCardData): Promise<Buffer> {
  const width = 1000;
  const height = 750;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. Background Fill (Soft Dashboard Grey)
  ctx.fillStyle = '#f0f2f5';
  ctx.fillRect(0, 0, width, height);

  // Helper for Rounded Rectangles
  const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number, fillStyle: string, strokeStyle?: string) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };

  // Helper for Header Banners
  const drawHeaderBanner = (x: number, y: number, w: number, h: number, r: number, text: string) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = '#be123c'; // Vibrant Red
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + 16, y + h - 8);
  };

  // Status Badge Colors & Style Definition
  const STATUS_STYLES: Record<string, { label: string; badgeColor: string; strokeColor: string; shadowColor: string }> = {
    ORIJINAL: { label: '✓', badgeColor: '#22c55e', strokeColor: '#ffffff', shadowColor: 'rgba(34, 197, 94, 0.4)' },
    LOKAL: { label: 'L', badgeColor: '#ff6b00', strokeColor: '#ffffff', shadowColor: 'rgba(255, 107, 0, 0.5)' },
    BOYALI: { label: 'B', badgeColor: '#1a69ff', strokeColor: '#ffffff', shadowColor: 'rgba(26, 105, 255, 0.5)' },
    DEGISEN: { label: 'D', badgeColor: '#e62e2e', strokeColor: '#ffffff', shadowColor: 'rgba(230, 46, 46, 0.5)' },
  };

  const getStyle = (partName: string) => {
    const status = (data.paintScheme && data.paintScheme[partName]) || 'ORIJINAL';
    return STATUS_STYLES[status] || STATUS_STYLES.ORIJINAL;
  };

  // ================= TOP CARD: Değerlenen Araç Bilgileri =================
  const topX = 25;
  const topY = 20;
  const topW = 950;
  const topH = 160;

  drawRoundedRect(topX, topY, topW, topH, 12, '#ffffff', '#e2e8f0');
  drawHeaderBanner(topX, topY, topW, 36, 12, 'Değerlenen Araç Bilgileri');

  ctx.textAlign = 'left';
  const brandName = data.brandName || (data.vehicleName ? data.vehicleName.split(' ')[0] : 'Otomobil');
  const modelName = data.modelName || (data.vehicleName ? data.vehicleName.split(' ').slice(1, 3).join(' ') : 'Serisi');
  const variantName = data.variantName || (data.vehicleName ? data.vehicleName.split(' ').slice(3).join(' ') : '-');
  const bodyType = data.bodyType || 'Sedan';
  const yearStr = String(data.year || '2023');
  const transmission = data.transmission || 'Otomatik';
  const fuel = data.fuel || 'Benzin';
  const color = data.color || 'Metalik Gri';
  const mileageStr = `${data.mileage ? data.mileage.toLocaleString('tr-TR') : '0'} Km`;
  const tramerStr = typeof data.tramerAmount === 'number' ? `${data.tramerAmount.toLocaleString('tr-TR')} TL` : (data.tramerAmount || '0 TL');

  const col1X = topX + 25;
  const startRowY = topY + 62;
  const rowGap = 24;

  const drawLabelValue = (x: number, y: number, label: string, val: string) => {
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillText(val, x + 65, y);
  };

  drawLabelValue(col1X, startRowY, 'Araç', ': Otomobil');
  drawLabelValue(col1X, startRowY + rowGap, 'Yılı', `: ${yearStr}`);
  drawLabelValue(col1X, startRowY + rowGap * 2, 'Marka', `: ${brandName.toUpperCase()}`);
  drawLabelValue(col1X, startRowY + rowGap * 3, 'Model', `: ${modelName.toUpperCase()}`);

  const col2X = topX + 340;
  drawLabelValue(col2X, startRowY, 'Tip', `: ${variantName.substring(0, 26)}`);
  drawLabelValue(col2X, startRowY + rowGap, 'Kasa', `: ${bodyType}`);
  drawLabelValue(col2X, startRowY + rowGap * 2, 'Vites', `: ${transmission}`);
  drawLabelValue(col2X, startRowY + rowGap * 3, 'Yakıt', `: ${fuel}`);

  const col3X = topX + 680;
  drawLabelValue(col3X, startRowY, 'Renk', `: ${color}`);
  drawLabelValue(col3X, startRowY + rowGap, 'Km', `: ${mileageStr}`);
  drawLabelValue(col3X, startRowY + rowGap * 2, 'Tramer', `: ${tramerStr}`);


  // ================= LEFT CARD: Ekspertiz Kaporta Bilgileri =================
  const leftX = 25;
  const leftY = 195;
  const leftW = 465;
  const leftH = 530;

  drawRoundedRect(leftX, leftY, leftW, leftH, 12, '#ffffff', '#e2e8f0');
  drawHeaderBanner(leftX, leftY, leftW, 34, 12, 'Ekspertiz Kaporta Bilgileri');

  const cx = leftX + leftW / 2;
  const cy = leftY + 230;
  const imgW = 410;
  const imgH = 230;
  const imgX = cx - imgW / 2;
  const imgY = cy - imgH / 2;

  // 1. Draw Base Car Image Uncovered (100% Clean & Visible!)
  const baseImgBuf = getBaseSchematicBuffer();
  if (baseImgBuf) {
    try {
      const loadedImg = await loadImage(baseImgBuf);
      ctx.drawImage(loadedImg, imgX, imgY, imgW, imgH);
    } catch (e) {}
  }

  const scaleX = imgW / 1024;
  const scaleY = imgH / 576;

  // 2. Draw Clean Glowing Circular Badges over exact parts (NO RECTANGULAR BOXES)
  const drawBadge = (bx: number, by: number, partName: string) => {
    const style = getStyle(partName);
    const isSpecial = style.label !== '✓';

    // Soft Outer Glow Ring for damaged/painted parts
    if (isSpecial) {
      ctx.beginPath();
      ctx.arc(bx, by, 16, 0, 2 * Math.PI);
      ctx.fillStyle = style.shadowColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(bx, by, isSpecial ? 13 : 11, 0, 2 * Math.PI);
    ctx.fillStyle = style.badgeColor;
    ctx.fill();
    ctx.strokeStyle = style.strokeColor;
    ctx.lineWidth = isSpecial ? 2.5 : 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isSpecial ? 13 : 12}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    if (style.label === '✓') {
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(bx - 1, by + 3);
      ctx.lineTo(bx + 4, by - 4);
      ctx.stroke();
    } else {
      ctx.fillText(style.label, bx, by + 4.5);
    }
  };

  // Badge Positions
  drawBadge(imgX + 512 * scaleX, imgY + 63 * scaleY, 'Ön Tampon');
  drawBadge(imgX + 512 * scaleX, imgY + 147 * scaleY, 'Motor Kaputu');
  drawBadge(imgX + 512 * scaleX, imgY + 333 * scaleY, 'Tavan');
  drawBadge(imgX + 512 * scaleX, imgY + 478 * scaleY, 'Bagaj');
  drawBadge(imgX + 512 * scaleX, imgY + 524 * scaleY, 'Arka Tampon');

  drawBadge(imgX + 341 * scaleX, imgY + 141 * scaleY, 'Sol Ön Çamurluk');
  drawBadge(imgX + 341 * scaleX, imgY + 254 * scaleY, 'Sol Ön Kapı');
  drawBadge(imgX + 341 * scaleX, imgY + 365 * scaleY, 'Sol Arka Kapı');
  drawBadge(imgX + 341 * scaleX, imgY + 460 * scaleY, 'Sol Arka Çamurluk');

  drawBadge(imgX + 683 * scaleX, imgY + 141 * scaleY, 'Sağ Ön Çamurluk');
  drawBadge(imgX + 683 * scaleX, imgY + 254 * scaleY, 'Sağ Ön Kapı');
  drawBadge(imgX + 683 * scaleX, imgY + 365 * scaleY, 'Sağ Arka Kapı');
  drawBadge(imgX + 683 * scaleX, imgY + 460 * scaleY, 'Sağ Arka Çamurluk');

  // 3. Middle Legend / Status Summary Bar
  const summaryY = leftY + 365;
  const nonOriginalParts = Object.entries(data.paintScheme || {}).filter(
    ([_, status]) => status && status !== 'ORIJINAL'
  );

  if (nonOriginalParts.length > 0) {
    ctx.fillStyle = '#fff7ed'; // Light warm orange tint
    drawRoundedRect(leftX + 15, summaryY, leftW - 30, 42, 8, '#fff7ed', '#ffedd5');

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px Arial, sans-serif';
    
    // Format list e.g. "Sol Ön Kapı: Boyalı | Tavan: Lokal Boyalı"
    const summaryText = nonOriginalParts
      .map(([part, status]) => `${part} (${status === 'DEGISEN' ? 'Değişen' : status === 'BOYALI' ? 'Boyalı' : 'Lokal'})`)
      .join(' • ');

    ctx.fillStyle = '#c2410c';
    ctx.fillText(`İşlemli Parçalar: ${summaryText.substring(0, 45)}${summaryText.length > 45 ? '...' : ''}`, cx, summaryY + 25);
  } else {
    ctx.fillStyle = '#f0fdf4'; // Light green tint
    drawRoundedRect(leftX + 15, summaryY, leftW - 30, 42, 8, '#f0fdf4', '#bbf7d0');

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillStyle = '#15803d';
    ctx.fillText('✓ Aracın Tüm Parçaları Orijinaldir (Hatasız)', cx, summaryY + 25);
  }

  // Bottom Chassis Badges
  const bottomBadgeY = leftY + leftH - 45;
  const badgeW = 135;
  const drawChassisBox = (bx: number, title: string, isOriginal: boolean) => {
    drawRoundedRect(bx, bottomBadgeY, badgeW, 35, 8, '#f8fafc', '#cbd5e1');
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, bx + badgeW / 2, bottomBadgeY + 16);

    ctx.fillStyle = isOriginal ? '#16a34a' : '#dc2626';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(isOriginal ? 'Orjinal' : 'İşlemli', bx + badgeW / 2, bottomBadgeY + 30);
  };

  const ch = data.chassisStatus || {};
  drawChassisBox(leftX + 15, 'Sağ Şasi', ch.rightChassisOriginal !== false);
  drawChassisBox(leftX + 165, 'Sol Şasi', ch.leftChassisOriginal !== false);
  drawChassisBox(leftX + 315, 'Bagaj Havuzu', ch.trunkFloorOriginal !== false);


  // ================= RIGHT CARD: Fiyat Bilgisi & NAKİTGARAJ Red Banner =================
  const rightX = 510;
  const rightY = 195;
  const rightW = 465;
  const rightH = 530;

  drawRoundedRect(rightX, rightY, rightW, rightH, 12, '#ffffff', '#e2e8f0');
  drawHeaderBanner(rightX, rightY, rightW, 34, 12, 'Fiyat Bilgisi');

  // Large Offer Price Display
  const priceY = rightY + 52;
  drawRoundedRect(rightX + 15, priceY, rightW - 30, 65, 10, '#ffffff', '#e2e8f0');
  ctx.fillStyle = '#be123c';
  ctx.font = 'extrabold 36px Arial, sans-serif';
  ctx.textAlign = 'center';
  const priceVal = data.finalOfferedPrice ? `${data.finalOfferedPrice.toLocaleString('tr-TR')} TL` : 'Teklif Edildi';
  ctx.fillText(priceVal, rightX + rightW / 2, priceY + 46);

  // Corporate Red Card Replica (NAKİTGARAJ)
  const bannerY = priceY + 80;
  const bannerW = rightW - 30;
  const bannerH = 315;

  drawRoundedRect(rightX + 15, bannerY, bannerW, bannerH, 14, '#be123c');

  // Inner White Logo Box
  const logoW = 280;
  const logoH = 52;
  const logoX = rightX + (rightW - logoW) / 2;
  const logoY = bannerY + 25;
  drawRoundedRect(logoX, logoY, logoW, logoH, 8, '#ffffff');

  // NAKİTGARAJ Corporate Text
  ctx.fillStyle = '#be123c';
  ctx.font = 'black 28px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NAKİTGARAJ', rightX + rightW / 2, logoY + 36);

  // Red Card Slogan Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('aracını değerle', rightX + rightW / 2, bannerY + 125);
  ctx.font = 'black 34px Arial, sans-serif';
  ctx.fillText('hemen SAT!', rightX + rightW / 2, bannerY + 165);

  // Draw 3 Crisp Vector Icons (Car, Cash/Handshake, Smiley)
  const iconY = bannerY + 215;

  // Icon 1: Car Vector Icon
  const carX = rightX + 85;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(carX, iconY - 14, 46, 18, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(carX + 8, iconY - 26, 30, 14, 4);
  ctx.fill();
  ctx.fillStyle = '#be123c';
  ctx.beginPath();
  ctx.arc(carX + 10, iconY + 4, 6, 0, Math.PI * 2);
  ctx.arc(carX + 36, iconY + 4, 6, 0, Math.PI * 2);
  ctx.fill();

  // Icon 2: Cash & Handshake Vector Icon
  const handX = rightX + rightW / 2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(handX - 22, iconY - 22, 44, 26, 4);
  ctx.fill();
  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(handX, iconY - 9, 7, 0, Math.PI * 2);
  ctx.stroke();

  // Icon 3: Smiley Face Vector Icon
  const smileX = rightX + rightW - 85;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(smileX, iconY - 8, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#be123c';
  ctx.beginPath();
  ctx.arc(smileX - 6, iconY - 13, 2.5, 0, Math.PI * 2);
  ctx.arc(smileX + 6, iconY - 13, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#be123c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(smileX, iconY - 8, 10, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  // Footer Slogan Text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('bilgilerini gir, anında fiyat al', rightX + rightW / 2, bannerY + 285);

  return canvas.toBuffer('image/png');
}
