import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsUsername } from '../../../common/username.js';

export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsUsername()
  username: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
