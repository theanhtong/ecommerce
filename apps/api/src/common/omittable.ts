import { ValidateIf } from 'class-validator';

// Unlike IsOptional, null is still validated, so a PATCH cannot clear a required column.
export const Omittable = () => ValidateIf((_, value) => value !== undefined);
