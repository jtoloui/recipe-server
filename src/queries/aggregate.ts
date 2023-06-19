export const groupRecipesByLabel = [
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
                  $substrCP: [
                    '$_id',
                    1,
                    { $subtract: [{ $strLenCP: '$_id' }, 1] },
                  ],
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
