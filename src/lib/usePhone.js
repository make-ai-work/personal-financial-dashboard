import { useEffect, useState } from 'react'

// True on a phone-sized screen. Screens use it to show a simpler layout there.
export const PHONE_QUERY = '(max-width: 640px)'
export function usePhone() {
  const get = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
  const [phone, setPhone] = useState(get)
  useEffect(() => {
    const m = window.matchMedia(PHONE_QUERY)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    on()
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}
