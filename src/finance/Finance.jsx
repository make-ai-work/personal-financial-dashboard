import { useVault } from './VaultContext.jsx'
import { FirstRun, Unlock } from './Gate.jsx'
import Dashboard from './Dashboard.jsx'

export default function Finance() {
  const { phase } = useVault()
  if (phase === 'loading') return null
  if (phase === 'start') return <FirstRun />
  if (phase === 'locked') return <Unlock />
  return <Dashboard />
}
