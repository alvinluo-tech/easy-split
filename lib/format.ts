export const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export const cny = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });

export function formatBoth(amountGBP: number, rate: number) {
  const cnyVal = amountGBP * (rate || 0);
  return `${gbp.format(amountGBP)} / ${cny.format(cnyVal)}`;
}
