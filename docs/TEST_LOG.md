# Live Test Log — 2026-11-05

## AUTH-01 Register — PASS
- missing fields → 400 "Full name, email, and password are required."
- duplicate email → 409 "account already exists"
- password <8 → 400 "at least 8 characters"
- valid → 201, user+workspace+sessionToken+verificationToken returned
- NOTE: verificationToken returned in response (dev backdoor — see SECURITY findings)

## AUTH-02 Login — PASS
- wrong password → 401 generic "Invalid email or password."
- unknown email → 401 same message (no user enumeration)
- missing fields → 400
- NOTE: no lockout/rate-limit test yet; MFA branch untested (mfaEnabled users only)

## AUTH-03 Logout — PASS
- POST /logout → success; subsequent /me with same token → 401 session invalid

## AUTH-04 Session validation (/me) — PASS
- no token → 401 "Authentication required"
- valid token → 200 user+workspace+workspaces+memberRole (verified earlier)

## Pending next: AUTH-05 email verification, AUTH-07/08 reset+change password, AUTH-14 rate limit, suspended-user path
