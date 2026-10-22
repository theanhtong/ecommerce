import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  displayName?: string | null;
}
