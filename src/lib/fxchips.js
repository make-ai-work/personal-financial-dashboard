// The exchange rates for the ticker. fx = { base, rates } from useFx: rates[Q] = how many Q you get for 1 base currency.
// -> [{ id, from: '$', to: '₹', value: '84.20' }], the base to each other currency, then one pair between the others when there are three.
import { COUNTRIES, curSym } from './format.js'

const fmt = (n) => (n >= 100 ? n.toFixed(1) : n >= 1 ? n.toFixed(2) : n.toFixed(3))
export function fxChips(fx) {
  if (!fx || !fx.base || !fx.rates) return []
  const codes = Object.keys(fx.rates).filter((c) => fx.rates[c] > 0 && c !== fx.base && Object.values(COUNTRIES).some((x) => x.currency === c))
  const out = codes.map((c) => ({ id: `${fx.base}-${c}`, from: curSym(fx.base), to: curSym(c), value: fmt(fx.rates[c]) }))
  for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
    const v = fx.rates[codes[j]] / fx.rates[codes[i]] // 1 codes[i] = v codes[j]
    if (v >= 0.1) out.push({ id: `${codes[i]}-${codes[j]}`, from: curSym(codes[i]), to: curSym(codes[j]), value: fmt(v) })
    else if (v > 0) out.push({ id: `${codes[j]}-${codes[i]}`, from: curSym(codes[j]), to: curSym(codes[i]), value: fmt(1 / v) }) // a tiny rate reads better the other way round
  }
  return out
}
