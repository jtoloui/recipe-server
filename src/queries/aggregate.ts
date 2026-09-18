import { FilterQuery, PipelineStage } from 'mongoose';

import { Recipe } from '@/models/recipe';

/**
 * A measurement is considered "popular" once it appears in more than this many
 * recipes. Extracted from a bare `> 4` magic number (RECON-FINDINGS D6); tune
 * here rather than inline. Note: on a small dataset a high threshold yields an
 * empty result, which is expected.
 */
export const POPULAR_MEASUREMENT_MIN_COUNT = 4;

export const groupRecipesByLabel: PipelineStage[] = [
  {
    $facet: {
      totalRecipes: [
        {
          $count: 'total',
        },
      ],
      labelCounts: [
        {
          $unwind: '$labels',
        },
        {
          $group: {
            _id: { $toLower: '$labels' },
            count: { $sum: 1 },
            imageSrcs: { $push: '$image.src' },
          },
        },
        {
          $addFields: {
            label: {
              $concat: [
                { $toUpper: { $substrCP: ['$_id', 0, 1] } },
                {
                  $substrCP: ['$_id', 1, { $subtract: [{ $strLenCP: '$_id' }, 1] }],
                },
              ],
            },
            image: { $arrayElemAt: ['$imageSrcs', 0] },
          },
        },
        {
          $project: {
            _id: 0,
            label: 1,
            count: 1,
            image: 1,
          },
        },
        {
          $sort: {
            label: 1, // 1 for ascending order, -1 for descending
          },
        },
      ],
    },
  },
  {
    $project: {
      totalRecipes: { $arrayElemAt: ['$totalRecipes.total', 0] },
      labelCounts: 1,
    },
  },
];

export const groupRecipesByLabelWithQuery = (query: FilterQuery<Recipe>, withSearch: boolean) => {
  const pipeline: PipelineStage[] = withSearch ? [{ $match: query }, ...groupRecipesByLabel] : [...groupRecipesByLabel];
  return pipeline;
};

export const getMeasurementsType = [
  { $unwind: '$ingredients' },
  { $unwind: '$ingredients.measurement' },
  { $group: { _id: '$ingredients.measurement', count: { $sum: 1 } } },
  { $match: { count: { $gt: POPULAR_MEASUREMENT_MIN_COUNT } } },
  { $group: { _id: null, measurements: { $push: '$_id' } } },
];
