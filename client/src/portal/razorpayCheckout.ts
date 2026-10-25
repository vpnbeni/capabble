import type { PortalCheckoutResponse, PortalPaymentOrder } from './portalService'

// Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js), loaded only when a parent pays.
// The money goes to the school's own Razorpay account; the key here is the school's public key ID.

type RazorpayInstance = { open: () => void; on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void }
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor
  }
}

const SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let loading: Promise<RazorpayConstructor> | null = null

const loadCheckout = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (!loading) {
    loading = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SRC
      script.async = true
      script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay did not load')))
      script.onerror = () => {
        loading = null
        script.remove()
        reject(new Error('Razorpay could not be reached. Check your connection and try again.'))
      }
      document.body.appendChild(script)
    })
  }
  return loading
}

export type CheckoutOutcome =
  | { kind: 'paid'; response: PortalCheckoutResponse }
  | { kind: 'failed'; message: string }
  | { kind: 'closed' }

/** Open Checkout for an order; resolves when the parent pays, the payment fails or they close it. */
export const openCheckout = async (order: PortalPaymentOrder, accentColor?: string): Promise<CheckoutOutcome> => {
  const Razorpay = await loadCheckout()
  return new Promise<CheckoutOutcome>((resolve) => {
    let failure = ''
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.razorpayOrderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: order.schoolName,
      description: order.description,
      prefill: order.prefill,
      notes: { capabble_order: order.orderId },
      ...(accentColor ? { theme: { color: accentColor } } : {}),
      handler: (response: PortalCheckoutResponse) => resolve({ kind: 'paid', response }),
      modal: {
        // Checkout stays open after a failed attempt so the parent can retry; report the last failure on close.
        ondismiss: () => resolve(failure ? { kind: 'failed', message: failure } : { kind: 'closed' }),
      },
    })
    checkout.on('payment.failed', (response) => {
      failure = response?.error?.description || 'The payment did not go through.'
    })
    checkout.open()
  })
}
