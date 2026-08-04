import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateConsignmentDto {
  @IsOptional()
  @IsString()
  vehicleEvaluationId?: string;

  @IsNotEmpty({ message: 'Ad boş bırakılamaz.' })
  @IsString()
  firstName!: string;

  @IsNotEmpty({ message: 'Soyad boş bırakılamaz.' })
  @IsString()
  lastName!: string;

  @IsNotEmpty({ message: 'Telefon numarası boş bırakılamaz.' })
  @IsString()
  phone!: string;

  @IsNotEmpty({ message: 'E-posta adresi boş bırakılamaz.' })
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  email!: string;

  @IsNotEmpty({ message: 'Şehir seçimi boş bırakılamaz.' })
  @IsString()
  province!: string;

  @IsNotEmpty({ message: 'İlçe seçimi boş bırakılamaz.' })
  @IsString()
  district!: string;

  @IsNotEmpty({ message: 'Tercih edilen iletişim kanalı boş bırakılamaz.' })
  @IsString()
  preferredContact!: string; // PHONE, EMAIL, WHATSAPP

  @IsOptional()
  @IsString()
  notes?: string;

  // Optional vehicle specs for on-the-fly valuation creation
  @IsOptional()
  year?: number;

  @IsOptional()
  @IsString()
  manufacturerId?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

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

  @IsOptional()
  mileage?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  paintScheme?: string;

  @IsOptional()
  @IsString()
  chassisState?: string;

  @IsOptional()
  @IsString()
  equipments?: string;

  @IsOptional()
  @IsString()
  vehicleStatus?: string;
}
