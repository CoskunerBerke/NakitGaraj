import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  Max,
  Matches,
  IsOptional,
  Length,
  IsEnum,
  IsIn,
} from 'class-validator';
import { CANONICAL_BODY_TYPES } from '../listing-attributes';

import { Transform } from 'class-transformer';

export class CreateEvaluationDto {
  @IsNotEmpty({ message: 'Yıl alanı boş bırakılamaz.' })
  @IsNumber({}, { message: 'Yıl sayı olmalıdır.' })
  @Min(1990, { message: 'Geçerli bir model yılı giriniz.' })
  @Max(2027, { message: 'Geçerli bir model yılı giriniz.' })
  year!: number;

  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  manufacturerId!: string;

  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  modelId!: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  variantId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  packageId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  bodyTypeId?: string;

  /**
   * GOZLENEN ARAC HEDEFI — gercek Sahibinden ilan verisinden secilen canonical
   * degerler. Katalogda (VehicleSpecification) karsiligi olmayan gercek araclar
   * (orn. 8.494 ilanlik Fiat Egea) bu alanlar sayesinde degerlenebilir.
   * Verildiginde katalog kaydi ZORUNLU DEGILDIR; spec varsa yalnizca teknik
   * zenginlestirme (hp/tork/motor hacmi) icin kullanilir.
   */
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Length(1, 60)
  observedMake?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Length(1, 80)
  observedModel?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Length(1, 80)
  observedEngine?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Length(1, 80)
  observedTrim?: string;

  /**
   * Musterinin, aracin kendi ilan havuzunda GERCEKTEN gorulen kasa tipleri
   * arasindan yaptigi secim (canonical deger). Katalogtaki BodyType sozlugu
   * SPORTBACK / GRAN_COUPE gibi siniflari hic icermedigi ve bazi modellerde
   * (orn. BMW 4 Serisi Cabrio) dogru kasa secilemedigi icin gereklidir.
   * 'UNKNOWN' = musteri bilmiyor -> kasa uzerinden hicbir eleme yapilmaz.
   */
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @IsIn([...CANONICAL_BODY_TYPES, 'UNKNOWN'], { message: 'Geçersiz kasa tipi.' })
  observedBodyType?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  fuelTypeId?: string;

  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsOptional()
  @IsString()
  transmissionTypeId?: string;

  @IsNotEmpty({ message: 'Kilometre boş bırakılamaz.' })
  @IsNumber({}, { message: 'Kilometre sayı olmalıdır.' })
  @Min(0, { message: 'Kilometre negatif olamaz.' })
  @Max(2000000, { message: 'Lütfen gerçekçi bir kilometre giriniz.' })
  mileage!: number;

  @IsNotEmpty({ message: 'Araç rengi boş bırakılamaz.' })
  @IsString()
  @Length(1, 50, { message: 'Renk adı çok uzun.' })
  color!: string;

  @IsNotEmpty({ message: 'Hasar durumu boş bırakılamaz.' })
  @IsString()
  @IsEnum(['YES', 'NO', 'UNKNOWN'], { message: 'Geçersiz hasar durumu.' })
  damageStatus!: string; // YES, NO, UNKNOWN

  @IsNotEmpty({ message: 'Plaka boş bırakılamaz.' })
  @IsString()
  @Matches(/^(0[1-9]|[1-7][0-9]|8[0-1])[A-Z]{1,3}\d{2,4}$/, {
    message: 'Lütfen geçerli bir plaka giriniz.',
  })
  licensePlate!: string;

  // Customer personal details
  @IsNotEmpty({ message: 'Ad alanı boş bırakılamaz.' })
  @IsString()
  @Length(1, 50, { message: 'Ad alanı 1-50 karakter arasında olmalıdır.' })
  firstName!: string;

  @IsNotEmpty({ message: 'Soyad alanı boş bırakılamaz.' })
  @IsString()
  @Length(1, 50, { message: 'Soyad alanı 1-50 karakter arasında olmalıdır.' })
  lastName!: string;

  @IsNotEmpty({ message: 'Telefon numarası boş bırakılamaz.' })
  @IsString()
  @Matches(/^(05|5)\d{9}$/, {
    message: 'Lütfen geçerli bir telefon numarası giriniz.',
  })
  phone!: string;

  // Timeline and desired pricing details
  @IsNotEmpty({ message: 'Satış süresi seçimi zorunludur.' })
  @IsString()
  @Length(1, 50)
  sellingTimeline!: string;

  @IsNotEmpty({ message: 'İstediğiniz fiyat alanı boş bırakılamaz.' })
  @IsNumber({}, { message: 'İstediğiniz fiyat sayı olmalıdır.' })
  @Min(0, { message: 'İstediğiniz fiyat negatif olamaz.' })
  @Max(100000000, { message: 'Fiyat çok yüksek.' })
  userDesiredPrice!: number;

  // Optional detailed appraisal data
  @IsOptional()
  @IsString()
  @Length(0, 10000)
  paintScheme?: string;    // JSON stringified 13-parts mapping

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  chassisState?: string;   // JSON stringified chassis status

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  equipments?: string;     // JSON stringified checkboxes and features

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  vehicleStatus?: string;  // JSON stringified mechanical details

  @IsOptional()
  @IsString()
  @Length(0, 10000)
  features?: string;       // JSON stringified checklist of vehicle features

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  tramerAmount?: string;
}
