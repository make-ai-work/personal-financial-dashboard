import { useEffect, useState } from 'react'
import { analyse } from '../lib/montecarlo.js'

// Run the simulation after a short pause so typing in a field stays responsive.
export default function useAnalysis(a, plan, enabled) {
  const key = JSON.stringify([a, plan.age, plan.retAge, plan.life, plan.savings, plan.ac, plan.g, plan.tax, plan.inf, plan.spend, plan.income, plan.lumps, enabled])
  const [state, setState] = useState({ key: '', A: null })
  useEffect(() => {
    if (!enabled) { setState({ key, A: null }); return undefined }
    const t = setTimeout(() => setState({ key, A: analyse(a, plan) }), 120)
    return () => clearTimeout(t)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { A: state.A, busy: state.key !== key }
}
