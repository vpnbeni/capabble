// capabble.cloud: the marketing site, which also hosts Help, Privacy and Terms.
export const getMarketingOrigin = () =>
  typeof window !== 'undefined' && window.location.hostname.startsWith('stage')
    ? 'https://stage.capabble.cloud'
    : 'https://www.capabble.cloud'

export const marketingLinks = () => {
  const origin = getMarketingOrigin()
  return {
    home: origin,
    privacy: `${origin}/privacy`,
    terms: `${origin}/terms`,
    help: `${origin}/help`,
    signingInHelp: `${origin}/help?topic=signing-in`,
  }
}
