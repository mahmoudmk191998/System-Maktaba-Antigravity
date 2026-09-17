# Branches & Location Filtering

Multi-unit restaurant brands manage distinct branch locations. Integrations can be restricted to specific branches or authorized across all branches.

## Fetch Active Branches
```http
GET /api/v1/branches
Authorization: Bearer <API_KEY>
```

## Branch Context Header
When performing branch-specific catalog queries or placing orders, provide the `X-Branch-ID` header:
```http
GET /api/v1/menu
X-Branch-ID: branch_downtown
Authorization: Bearer <API_KEY>
```
