import ClockWidget from './components/ClockWidget.jsx'

export default function App() {
  return (
    <main className="dashboard">
      <h1 className="dashboard-title">My Dashboard</h1>
      <div className="grid">
        <ClockWidget />
      </div>
    </main>
  )
}
