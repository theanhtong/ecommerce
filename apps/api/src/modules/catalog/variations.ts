import { BadRequestException } from '@nestjs/common';
import { coded } from '../../common/http-error.js';

export interface TierInput {
  name: string;
  options: string[];
}

export interface ModelInput {
  tierIndex: number[];
}

const MAX_TIERS = 2;

const hasDuplicates = (values: string[]) =>
  new Set(values.map((v) => v.toLowerCase())).size !== values.length;

// Assumption: every option combination must have exactly one model.
export function validateVariations(tiers: TierInput[], models: ModelInput[]) {
  if (tiers.length > MAX_TIERS) {
    throw new BadRequestException(
      coded('tiers_max', `At most ${MAX_TIERS} tier variations`, {
        max: MAX_TIERS,
      }),
    );
  }
  if (hasDuplicates(tiers.map((t) => t.name))) {
    throw new BadRequestException('Tier variation names must be unique');
  }
  for (const tier of tiers) {
    if (hasDuplicates(tier.options)) {
      throw new BadRequestException(
        coded(
          'tier_options_unique',
          `Options of "${tier.name}" must be unique`,
          {
            tier: tier.name,
          },
        ),
      );
    }
  }

  const combinations = tiers.reduce((n, t) => n * t.options.length, 1);
  if (models.length !== combinations) {
    throw new BadRequestException(
      coded(
        'models_per_combination',
        `Expected ${combinations} models, one per option combination`,
        { count: combinations },
      ),
    );
  }

  const seen = new Set<string>();
  for (const { tierIndex } of models) {
    const valid =
      tierIndex.length === tiers.length &&
      tierIndex.every(
        (i, t) => Number.isInteger(i) && i >= 0 && i < tiers[t].options.length,
      );
    if (!valid) {
      throw new BadRequestException(
        coded(
          'tier_index_invalid',
          `Invalid tierIndex [${tierIndex.join(', ')}]`,
        ),
      );
    }
    const key = tierIndex.join(',');
    if (seen.has(key)) {
      throw new BadRequestException(
        coded('tier_index_duplicate', `Duplicate tierIndex [${key}]`),
      );
    }
    seen.add(key);
  }
}
