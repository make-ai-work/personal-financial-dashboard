import { createContext, useContext } from 'react'

// Lets one tab send you to another (e.g. Finance -> the linked portfolio).
export const NavContext = createContext({ go: () => {}, focus: null, clearFocus: () => {} })
export const useNav = () => useContext(NavContext)
