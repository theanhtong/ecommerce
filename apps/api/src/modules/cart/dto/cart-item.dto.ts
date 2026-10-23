import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;
}

export class AddCartItemDto extends UpdateCartItemDto {
  @IsUUID()
  modelId: string;
}
