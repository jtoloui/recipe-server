import { Recipe } from '@/models/recipe';
import { FilterQuery, PipelineStage } from 'mongoose';

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
          },
        },
        {
          $project: {
            _id: 0,
            label: 1,
            count: 1,
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
  // Start with an empty array or with the $match stage if withSearch is true
  const pipeline: PipelineStage[] = withSearch ? [{ $match: query }, ...groupRecipesByLabel] : [...groupRecipesByLabel];
  return pipeline;
};

// export const groupRecipesByLabelWithQuery = (query: FilterQuery<Recipe>, withSearch: boolean) => [
//   {
//     $facet: {
//       // Count matching the specific conditions
//       matchingLabels: withSearch
//         ? [
//             { $match: query },
//             { $unwind: '$labels' },
//             { $group: { _id: { $toLower: '$labels' }, count: { $sum: 1 } } },
//             {
//               $addFields: {
//                 label: {
//                   $concat: [
//                     { $toUpper: { $substrCP: ['$_id', 0, 1] } },
//                     { $substrCP: ['$_id', 1, { $subtract: [{ $strLenCP: '$_id' }, 1] }] },
//                   ],
//                 },
//               },
//             },
//             { $project: { _id: 0, label: 1, count: 1 } },
//             { $sort: { label: 1 } },
//           ]
//         : [],

//       // Count across all documents, irrespective of conditions
//       allLabels: [
//         { $unwind: '$labels' },
//         { $group: { _id: { $toLower: '$labels' }, count: { $sum: 1 } } },
//         {
//           $addFields: {
//             label: {
//               $concat: [
//                 { $toUpper: { $substrCP: ['$_id', 0, 1] } },
//                 { $substrCP: ['$_id', 1, { $subtract: [{ $strLenCP: '$_id' }, 1] }] },
//               ],
//             },
//           },
//         },
//         { $project: { _id: 0, label: 1, count: 1 } },
//         { $sort: { label: 1 } },
//       ],

//       // Total recipes count matching the specific conditions
//       totalMatchingRecipes: withSearch ? [{ $match: query }, { $count: 'total' }] : [],

//       // Total recipes count across all documents
//       totalRecipes: [{ $count: 'total' }],
//     },
//   },
//   {
//     $project: {
//       // matchingLabels: 1,
//       allLabels: 1,
//       totalMatchingRecipes: { $arrayElemAt: ['$totalMatchingRecipes.total', 0] },
//       totalRecipes: { $arrayElemAt: ['$totalRecipes.total', 0] },
//     },
//   },
// ];

export const getMeasurementsType = [
  { $unwind: '$ingredients' },
  { $unwind: '$ingredients.measurement' },
  { $group: { _id: '$ingredients.measurement', count: { $sum: 1 } } },
  { $match: { count: { $gt: 4 } } },
  { $group: { _id: null, measurements: { $push: '$_id' } } },
];

export const getPopularLabelsAggregate = [
  {
    $unwind: '$labels',
  },
  {
    $group: {
      _id: {
        $toLower: '$labels',
      },
      count: {
        $sum: 1,
      },
    },
  },
  {
    $sort: {
      count: -1,
    },
  },
  {
    $limit: 10,
  },
  {
    $addFields: {
      capitalizedLabel: {
        $concat: [
          {
            $toUpper: {
              $substrCP: ['$_id', 0, 1],
            },
          },
          {
            $substrCP: [
              '$_id',
              1,
              {
                $subtract: [
                  {
                    $strLenCP: '$_id',
                  },
                  1,
                ],
              },
            ],
          },
        ],
      },
    },
  },
  {
    $group: {
      _id: null,
      labels: {
        $push: '$capitalizedLabel',
      },
    },
  },
];
