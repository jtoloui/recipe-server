export type LabelFromQueryResponse = {
  totalRecipes: number;
  labelCounts?: {
    label: string;
    count: number;
  }[];
};
