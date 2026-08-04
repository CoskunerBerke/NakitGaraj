import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateVehicleRequestDto {
  @IsNotEmpty({ message: 'Marka ismi boş bırakılamaz.' })
  @IsString()
  brand!: string;

  @IsNotEmpty({ message: 'Model ismi boş bırakılamaz.' })
  @IsString()
  model!: string;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
