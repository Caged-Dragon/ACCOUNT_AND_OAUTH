import { HubFrame } from '@/components/hub/HubFrame'
import { getHubUser } from '@/lib/hub'

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  const user = await getHubUser()
  return user ? <HubFrame user={user}>{children}</HubFrame> : <>{children}</>
}
