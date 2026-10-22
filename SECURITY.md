# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **GitHub:** [report a vulnerability](https://github.com/zubairalamsub/bdnumbers/security/advisories/new) (private to the maintainer), or
- **Email:** contact@bdrate.fyi

Include what you found, where (URL or file), and how to reproduce it. You can expect a first reply within a week. Please give a reasonable time to fix the issue before disclosing it.

## Scope

- The website `https://bdrate.fyi` (Cloudflare Pages, built from `site/`)
- The API `https://api.bdrate.fyi` (Cloudflare Worker, `worker/`)
- This repository's code and GitHub Actions workflows

Out of scope: the third-party sources the numbers come from (Bangladesh Bank, BAJUS, TCB and others), denial-of-service tests, and reports from automated scanners without a demonstrated impact.
