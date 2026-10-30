export type AppRole = 'administrador' | 'editor' | 'consulta'
export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: AppRole
  active: boolean
}
export type Circuit = {
  id: string
  circuit_key: string
  cfs: string | null
  do_number: string | null
  rfs_name: string | null
  circuit_type: string | null
  technology: string | null
  bandwidth: string | null
  origin_text: string | null
  destination_text: string | null
  operational_status: string
  identification_status: string
  updated_at: string
}
