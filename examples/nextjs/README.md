# Next.js Integration Guide for Universal RMS

This template demonstrates how a Next.js (App Router) restaurant application communicates securely with the RMS API using Server Actions and Route Handlers.

## Key Principles:
1. **Server Actions**: All checkout requests and pricing calculations occur server-side inside `actions/rms.ts`.
2. **Webhook Route Handler**: Listens at `/api/webhook` and accesses the raw request body with `await req.text()` for timing-safe signature verification.
