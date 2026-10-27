import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import StatusBar from '../finance/StatusBar.jsx'
import Overview from './Overview.jsx'
import PetPage from './PetPage.jsx'
import PetSettings from './PetSettings.jsx'
import { PetModal, RecordModal } from './PetForms.jsx'
import { addPet, addRecord } from '../lib/pets.js'

export default function PetsApp() {
  const { data, update } = useVault()
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null) // { kind: 'pet' } | { kind: 'record', petId, type }
  const pet = data.pets.find((p) => p.id === tab)
  const active = tab === 'settings' || pet ? tab : 'overview'
  const openRecord = (petId, type) => setModal({ kind: 'record', petId, type })

  return (
    <>
      <StatusBar />
      <nav className="subtabs">
        <button className={active === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>Overview</button>
        {data.pets.map((p) => <button key={p.id} className={active === p.id ? 'on' : ''} onClick={() => setTab(p.id)}>{p.icon} {p.name}</button>)}
        <button onClick={() => setModal({ kind: 'pet' })}>+ Add pet</button>
        {data.pets.length > 0 && <button onClick={() => openRecord(pet?.id, 'vaccine')}>+ Add record</button>}
        <button className={active === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
      </nav>
      <div className="subpage">
        {active === 'overview' && <Overview onOpenPet={setTab} onAddPet={() => setModal({ kind: 'pet' })} />}
        {pet && active === pet.id && <PetPage key={pet.id} pet={pet} onDeleted={() => setTab('overview')} openRecord={openRecord} />}
        {active === 'settings' && <PetSettings />}
      </div>
      {modal?.kind === 'pet' && (
        <PetModal onClose={() => setModal(null)} onSave={(p) => {
          const id = crypto.randomUUID()
          update((d) => addPet(d, { ...p, id }))
          setModal(null)
          setTab(id)
        }} />
      )}
      {modal?.kind === 'record' && (
        <RecordModal pets={data.pets} petId={modal.petId} type={modal.type} unit={data.settings.weightUnit} onClose={() => setModal(null)}
          onSave={(r) => { update((d) => addRecord(d, r)); setModal(null) }} />
      )}
    </>
  )
}
