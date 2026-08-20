# Marketing SSR — Vercel Read-Only Investigation

**Date:** 20 August 2026  
**Scope:** Read-only inspection only. No deployment, environment-variable, DNS, domain, database, or Vercel configuration changes were made.

## Evidence collected

### 1. Existing Vite project demonstrates normal Preview behavior

The sole remaining Vercel project in team `team_sw1yWCUPH1jnBa8sKHXqyMrM` is `simsim` (`prj_za9Z57x7BmGAwLdXCRAwIiqrD22E`). Its deployments from `staging/marketing-cms-e2e-preview` have `target: null`, generated branch aliases, and no production promotion. Deployments from `main` explicitly have `target: production`. Therefore the current Vite project correctly distinguishes the staging branch from the production branch.

### 2. Repository default and documented production-branch behavior

GitHub reports `main` as the repository default branch. Vercel's official Git documentation says a new project selects `main` as its Production Branch when present; all other Git branches are previews. This is consistent with the observed Vite deployments.

### 3. Team-level read-only findings

The team is a Hobby team. Its General Settings show only the default `.vercel.app` Preview suffix (no custom suffix configured) and Vercel Toolbar preferences. The read-only General Settings page exposes no policy that overrides an individual project's Production Branch or reclassifies an established project's non-production Git branch as Production.

### 4. Actual cause of the two isolated SSR incidents

Vercel's official Environments documentation states that **the first deployment of every new project is always a Production deployment**, including when the project is imported from Git, deployed from a branch other than its production branch, or deployed from the CLI without `--prod`. This documented platform rule exactly explains both isolated SSR attempts:

| Attempt | Requested route | Observed label | Explanation |
|---|---|---|---|
| Git-linked SSR project | Staging branch after project creation | Production | It was the project's first deployment. |
| Direct deployment | Explicit target `preview` | Production | It was the project's first deployment. |

The observed label is therefore not evidence that `staging/marketing-cms-e2e-preview` was configured as Production Branch, nor that a team-level policy transformed regular branch previews into Production. It is Vercel's documented first-deployment behavior for a new project.

## Current constraint

Both isolated projects were deleted after explicit approval. The team now contains only the original Vite project, and there is no existing SSR project that has already passed Vercel's unavoidable first-production-deployment lifecycle step. Under the mandatory constraints of **no new Production deployment**, **no modification to the existing production Vite project**, and **a distinct SSR project rooted at `marketing-ssr`**, there is no Vercel action that can create the first SSR deployment as Preview-only.

## Safe conclusion

No new SSR deployment should be created now. A Vercel Preview-only SSR deployment becomes possible only after a separate SSR project already exists beyond its first deployment, or after the owner explicitly relaxes the prohibition on the unavoidable initial isolated-project production deployment. Neither condition is currently available or authorized.

## Sources

1. [Vercel — Environments](https://vercel.com/docs/deployments/environments): preview/production behavior and the mandatory first Production deployment of a new project.
2. [Vercel — Deploying Git Repositories](https://vercel.com/docs/git): Production Branch selection and non-production branch Preview behavior.
3. [Vercel — Environment Variables](https://vercel.com/docs/environment-variables): Preview variables apply to Git branches that do not match the Production Branch.
4. [Vercel — vercel deploy](https://vercel.com/docs/cli/deploy): deployment target semantics.
