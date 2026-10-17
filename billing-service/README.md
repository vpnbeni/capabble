# Capabble Ledger Service

Standalone billing service for Capabble.

## Run

```bash
cd billing-service
npm install
npm run dev
```

## Endpoints

- `GET /health`
- `POST /webhooks/razorpay`
- Internal APIs under `/internal/*` protected by `x-billing-service-token`

## Notes

- Uses central platform MongoDB (`CENTRAL_DB_NAME`).
- Collections are prefixed with `billing_`.
- Razorpay adapter is active in v1; Stripe adapter is scaffolded for future use.
