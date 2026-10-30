/**
 * Top-down pictures of school vehicles for the live maps, drawn facing north so a map
 * turns them with a plain rotate(bearing). School vehicles in India are painted yellow,
 * so the colours here are the vehicles' own paint, not theme colours.
 */

export type VehicleKind = 'bus' | 'van' | 'car' | 'auto'

/** The map picture for a vehicle type from the vehicle record. */
export function vehicleKind(type?: string | null): VehicleKind {
  switch (String(type || '').toLowerCase()) {
    case 'mini bus':
    case 'van':
    case 'winger':
      return 'van'
    case 'car':
      return 'car'
    case 'auto':
      return 'auto'
    default:
      return 'bus'
  }
}

/** On-screen size in px, roughly to scale with each other. */
export const VEHICLE_SIZE: Record<VehicleKind, { width: number; height: number }> = {
  bus: { width: 22, height: 52 },
  van: { width: 20, height: 38 },
  car: { width: 18, height: 34 },
  auto: { width: 18, height: 30 },
}

const GLASS = '#26384A'
const YELLOW = '#F7B500'
const YELLOW_LIGHT = '#FFCB2E'
const YELLOW_DARK = '#B07F00'

const ART: Record<VehicleKind, string> = {
  bus:
    `<rect x="1" y="1" width="20" height="50" rx="4" fill="${YELLOW}" stroke="${YELLOW_DARK}" stroke-width="1.2"/>`
    + `<rect x="3" y="2.6" width="16" height="5.4" rx="1.6" fill="${GLASS}"/>`
    + `<rect x="3.6" y="10" width="14.8" height="36" rx="2" fill="${YELLOW_LIGHT}"/>`
    + `<rect x="8" y="14" width="6" height="5" rx="1" fill="${YELLOW}" stroke="${YELLOW_DARK}" stroke-width=".6"/>`
    + `<rect x="8" y="33" width="6" height="5" rx="1" fill="${YELLOW}" stroke="${YELLOW_DARK}" stroke-width=".6"/>`
    + `<rect x="1.6" y="11" width="1.5" height="34" fill="${GLASS}"/>`
    + `<rect x="18.9" y="11" width="1.5" height="34" fill="${GLASS}"/>`
    + `<rect x="5" y="47.6" width="12" height="2" rx="1" fill="${GLASS}"/>`
    + '<rect x="0" y="5.5" width="1.6" height="3" rx=".6" fill="#2B2B2B"/>'
    + '<rect x="20.4" y="5.5" width="1.6" height="3" rx=".6" fill="#2B2B2B"/>',
  van:
    `<rect x="1" y="1" width="18" height="36" rx="5" fill="${YELLOW}" stroke="${YELLOW_DARK}" stroke-width="1.2"/>`
    + `<path d="M3.2 5.5 Q10 2.6 16.8 5.5 L16 10 L4 10 Z" fill="${GLASS}"/>`
    + `<rect x="3.6" y="11.5" width="12.8" height="21" rx="2" fill="${YELLOW_LIGHT}"/>`
    + `<rect x="1.6" y="12" width="1.4" height="19" fill="${GLASS}"/>`
    + `<rect x="17" y="12" width="1.4" height="19" fill="${GLASS}"/>`
    + `<rect x="4.5" y="33.5" width="11" height="2" rx="1" fill="${GLASS}"/>`
    + '<rect x="0" y="8" width="1.6" height="2.6" rx=".6" fill="#2B2B2B"/>'
    + '<rect x="18.4" y="8" width="1.6" height="2.6" rx=".6" fill="#2B2B2B"/>',
  car:
    '<rect x="1.5" y="1" width="15" height="32" rx="6" fill="#F4F6F8" stroke="#8A96A3" stroke-width="1.2"/>'
    + `<path d="M3.6 10 Q9 7 14.4 10 L13.6 14 L4.4 14 Z" fill="${GLASS}"/>`
    + '<rect x="4.4" y="14.5" width="9.2" height="9" rx="1.5" fill="#E2E7EC"/>'
    + `<path d="M4.6 24.5 L13.4 24.5 L14 28 Q9 30 4 28 Z" fill="${GLASS}"/>`
    + '<rect x="0" y="9.5" width="1.6" height="2.4" rx=".6" fill="#2B2B2B"/>'
    + '<rect x="16.4" y="9.5" width="1.6" height="2.4" rx=".6" fill="#2B2B2B"/>',
  auto:
    `<path d="M9 1 C6.2 1 4.8 3 4.6 6 L3 12 L1.6 26.5 Q1.6 29 4 29 L14 29 Q16.4 29 16.4 26.5 L15 12 L13.4 6 C13.2 3 11.8 1 9 1 Z" fill="${YELLOW}" stroke="${YELLOW_DARK}" stroke-width="1.1"/>`
    + `<path d="M5.4 7.5 Q9 5.6 12.6 7.5 L13.2 11 L4.8 11 Z" fill="${GLASS}"/>`
    + '<rect x="3.2" y="11.6" width="11.6" height="16.2" rx="3" fill="#1F2328"/>'
    + '<rect x="5" y="13.5" width="8" height="1.2" rx=".6" fill="#3A4048"/>'
    + '<rect x="5" y="24.5" width="8" height="1.2" rx=".6" fill="#3A4048"/>',
}

/** The picture as an SVG string, facing north. */
export function vehicleSvg(kind: VehicleKind): string {
  const { width, height } = VEHICLE_SIZE[kind]
  const box = kind === 'bus' ? '0 0 22 52' : kind === 'van' ? '0 0 20 38' : kind === 'car' ? '0 0 18 34' : '0 0 18 30'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${width}" height="${height}" aria-hidden="true">${ART[kind]}</svg>`
}
