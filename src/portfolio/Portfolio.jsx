import { VaultGate } from '../finance/Gate.jsx'
import PortfolioApp from './PortfolioApp.jsx'

export default function Portfolio() {
  return <VaultGate><PortfolioApp /></VaultGate>
}
