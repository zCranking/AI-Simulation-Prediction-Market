export const MIN_PRICE = 5
export const MAX_PRICE = 50

export function priceToProbability(price: number): number {
  const p = (price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE)
  return Math.max(0, Math.min(100, p * 100))
}

export function probabilityToPrice(probability: number): number {
  const p = Math.max(0, Math.min(100, probability)) / 100
  return MIN_PRICE + p * (MAX_PRICE - MIN_PRICE)
}

export function calculateShares(
  dollars: number,
  price: number
): number {
  return dollars / price
}

export function calculatePayout(
  shares: number,
  winner: boolean
): number {
  return winner ? shares * MAX_PRICE : 0
}

export function calculatePnL(
  dollars: number,
  shares: number,
  winner: boolean
): number {
  const payout = calculatePayout(shares, winner)
  return payout - dollars
}