import { IsUUID } from 'class-validator';

export class AddWishlistDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;
}
