# Platform Security & Protection

The RMS platform enforces defense-in-depth security across all architectural layers.

## Key Protections
1. **Server-Side Authorization**: Every request validates tenant identity and fine-grained permissions (`orders:create`, `menu:read`, etc.).
2. **Branch Access Restriction**: Clients can only view and interact with branches listed in `allowed_branch_ids`.
3. **CORS & Origin Hardening**: Wildcards (`*`) are disallowed in production; only explicit domains in `allowed_origins` are permitted.
4. **Anti-SSRF Webhook Validation**: Outgoing webhook destination URLs are strictly validated to prevent intranet traversal, loopback access, and cloud metadata exploits (`169.254.169.254`).
5. **No Client-Side Secrets**: All credentials remain strictly on backend servers.
