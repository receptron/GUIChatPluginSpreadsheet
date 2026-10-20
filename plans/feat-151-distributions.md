# feat: chi-square, F, binomial, Poisson, gamma, beta and other distributions (#151)

## Scope
CHISQ.DIST/.RT/.INV/.INV.RT, F.DIST/.RT/.INV/.INV.RT, BINOM.DIST, BINOM.INV, POISSON.DIST,
HYPGEOM.DIST, NEGBINOM.DIST, EXPON.DIST, GAMMA.DIST, GAMMA.INV, GAMMALN, BETA.DIST, BETA.INV,
LOGNORM.DIST, LOGNORM.INV, WEIBULL.DIST, PHI, GAUSS, FISHER, FISHERINV.

## Layout
- `distribution-families-math.ts`: pure densities, tails and inverses, built on `special-functions.ts`.
  Each tail is computed directly (not as 1 − the other) so small probabilities keep their digits.
  Continuous inverses bisect the cdf; BINOM.INV halves 0..n.
- `distribution-families.ts`: argument rules (Excel's #NUM! conditions) and registration.
- `distribution-args.ts`: the argument readers shared with `distributions.ts`, moved out of it.
- `special-functions.ts`: `regularizedGammaLower`, the lower tail of the incomplete gamma.

## Decisions
- Degrees of freedom are truncated and must lie in 1..10^10, as in Excel.
- Old names are aliased only where arguments and meaning are identical: CHIDIST, CHIINV, FDIST,
  FINV, BINOMDIST, CRITBINOM, POISSON, EXPONDIST, GAMMADIST, GAMMAINV, GAMMALN.PRECISE, BETAINV,
  LOGINV, WEIBULL. BETADIST, LOGNORMDIST, HYPGEOMDIST and NEGBINOMDIST take different arguments
  (no cumulative flag) and are left out.
- BINOM.INV accepts a cumulative within a relative 1e-12 of alpha as reaching it, so an exact tie
  (BINOM.INV(1,0.5,0.5) = 0) is not lost to the incomplete beta's last few ulps.

## Verification
- 50-digit mpmath references (`tests/tools/generate_distribution_families_reference.py` →
  `tests/engine/fixtures/distribution-families-reference.json`), compared at relative 1e-9.
- Microsoft's worked examples, to the digits they print.
- Argument rules, aliases, and seeded properties (tails sum to 1, inverses undo, masses sum to the
  cumulative, BINOM.INV is the first count to reach alpha).
