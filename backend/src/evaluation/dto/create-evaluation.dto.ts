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
} from 'class-validator';

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

  @IsOptional()
  @IsString()
  @Length(1, 100)
  variantId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  packageId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  bodyTypeId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  fuelTypeId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
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
