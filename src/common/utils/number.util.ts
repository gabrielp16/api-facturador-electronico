export const roundCurrency = (value: number): number => {
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const formatAmount = (value: number, decimals = 2): string => {
  return roundCurrency(value).toFixed(decimals);
};

export const safeNumber = (value: number | string | undefined | null): number => {
  if (value === undefined || value === null || value === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};