// The web preview has no background location: the crew screens say location can't be shared here.

export const BUS_LOCATION_TASK = 'capabble-bus-location'
export type ShareResult = 'sharing' | 'denied' | 'background-denied' | 'off'

export const startSharing = async (_tripId: string, _label: string): Promise<ShareResult> => 'off'
export const isSharing = async (_tripId: string) => false
export const stopSharing = async () => undefined
