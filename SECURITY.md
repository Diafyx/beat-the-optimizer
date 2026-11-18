# Security policy

## Supported versions

Beat the Optimizer is a static website. Only the live site, built from the
latest release, is supported. Older releases are not patched.

| Version                    | Supported |
| -------------------------- | --------- |
| Live site (latest release) | Yes       |
| Older releases             | No        |

Development uses Node.js 22, 24 and 26.

## Reporting a vulnerability

Please do not open a public issue.

Report it privately through GitHub:
[Report a vulnerability](https://github.com/Diafyx/beat-the-optimizer/security/advisories/new).

Include what you found, how to reproduce it and what an attacker could do with
it.

- You will get an acknowledgement within **7 days**.
- The maintainer will keep you updated until the problem is fixed, and will
  credit you in the advisory unless you prefer not to be named.

## Scope

In scope: the site's code, the GitHub Actions workflows, and the build and
deployment pipeline. Problems in third-party services (GitHub, Cloudflare,
analytics providers) should go to those providers.
