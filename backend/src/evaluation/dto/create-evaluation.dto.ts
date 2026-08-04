import { IsNotEmpty, IsNumber, IsString, Min, Matches, IsOptional } from 'class-validator';

export class CreateEvaluationDto {
  @IsNotEmpty()
  @IsNumber()
  year!: number;

  @IsNotEmpty()
  @IsString()
  manufacturerId!: string;

  @IsNotEmpty()
  @IsString()
  modelId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  bodyTypeId?: string;

  @IsOptional()
  @IsString()
  fuelTypeId?: string;

  @IsOptional()
  @IsString()
  transmissionTypeId?: string;

  @IsNotEmpty({ message: 'Kilometre boş bırakılamaz.' })
  @IsNumber({}, { message: 'Kilometre sayı olmalıdır.' })
  @Min(0, { message: 'Kilometre negatif olamaz.' })
  mileage!: number;

  @IsNotEmpty({ message: 'Araç rengi boş bırakılamaz.' })
  @IsString()
  color!: string;

  @IsNotEmpty({ message: 'Hasar durumu boş bırakılamaz.' })
  @IsString()
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
  firstName!: string;

  @IsNotEmpty({ message: 'Soyad alanı boş bırakılamaz.' })
  @IsString()
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
  sellingTimeline!: string;

  @IsNotEmpty({ message: 'İstediğiniz fiyat alanı boş bırakılamaz.' })
  @IsNumber({}, { message: 'İstediğiniz fiyat sayı olmalıdır.' })
  @Min(0, { message: 'İstediğiniz fiyat negatif olamaz.' })
  userDesiredPrice!: number;

  // Optional detailed appraisal data
  @IsOptional()
  @IsString()
  paintScheme?: string;    // JSON stringified 13-parts mapping

  @IsOptional()
  @IsString()
  chassisState?: string;   // JSON stringified chassis status

  @IsOptional()
  @IsString()
  equipments?: string;     // JSON stringified checkboxes and features

  @IsOptional()
  @IsString()
  vehicleStatus?: string;  // JSON stringified mechanical details

  @IsOptional()
  @IsString()
  features?: string;       // JSON stringified checklist of vehicle features

  @IsOptional()
  @IsString()
  tramerAmount?: string;
}
