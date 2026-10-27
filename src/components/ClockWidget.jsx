import { useEffect, useState } from 'react'
import Widget from './Widget.jsx'

function greeting(hour) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function ClockWidget() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Widget>
      <p className="greeting">{greeting(now.getHours())}</p>
      <p className="time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="date">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </Widget>
  )
}
