import { describe, expect, it } from 'vitest';

import {
  POPULAR_MEASUREMENT_MIN_COUNT,
  getMeasurementsType,
  groupRecipesByLabel,
  groupRecipesByLabelWithQuery,
} from '@/queries/aggregate';

// Characterization tests pinning the aggregation pipeline shapes so the
// upcoming D3 service-layer refactor (collapsing the duplicate label queries)
// can't silently change them.
describe('aggregation pipelines', () => {
  it('groupRecipesByLabelWithQuery prepends a $match only when withSearch is true', () => {
    const query = { name: { $regex: 'x', $options: 'i' } };
    const withSearch = groupRecipesByLabelWithQuery(query, true);
    const withoutSearch = groupRecipesByLabelWithQuery(query, false);

    expect(withSearch[0]).toEqual({ $match: query });
    expect(withSearch.slice(1)).toEqual(groupRecipesByLabel);
    expect(withoutSearch).toEqual(groupRecipesByLabel);
  });

  it('getMeasurementsType uses the named popularity threshold (D6, was a bare 4)', () => {
    expect(POPULAR_MEASUREMENT_MIN_COUNT).toBe(4);
    const matchStage = getMeasurementsType.find((s) => '$match' in s) as { $match: { count: { $gt: number } } };
    expect(matchStage.$match.count.$gt).toBe(POPULAR_MEASUREMENT_MIN_COUNT);
  });

  it('groupRecipesByLabel faceted output has the expected top-level projection', () => {
    const project = groupRecipesByLabel.find((s) => '$project' in s) as {
      $project: Record<string, unknown>;
    };
    expect(project.$project).toHaveProperty('totalRecipes');
    expect(project.$project).toHaveProperty('labelCounts');
  });
});
