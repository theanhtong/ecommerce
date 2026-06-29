import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @MaxLength(100)
  fullName!: string;

  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, {
    message: 'Invalid Vietnamese phone number',
  })
  phone!: string;

  @IsString()
  addressLine!: string;

  @IsInt()
  provinceId!: number;

  @IsString()
  provinceName!: string;

  @IsInt()
  districtId!: number;

  @IsString()
  districtName!: string;

  @IsString()
  wardCode!: string;

  @IsString()
  wardName!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;
}
