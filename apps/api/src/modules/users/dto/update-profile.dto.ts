import { IsOptional } from 'class-validator';
import { IsUsername } from '../../../common/username.js';

export class UpdateProfileDto {
  @IsOptional()
  @IsUsername()
  username?: string;
}
