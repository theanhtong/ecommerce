import { IsUUID } from 'class-validator';

export class CheckWishlistDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;
}
