import { Omittable } from '../../../common/omittable.js';
import { IsUsername } from '../../../common/username.js';

export class UpdateProfileDto {
  @Omittable()
  @IsUsername()
  username?: string;
}
