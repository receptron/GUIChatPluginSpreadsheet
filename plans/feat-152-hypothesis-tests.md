# feat: hypothesis tests (#152)

Builds on #151 (the F and chi-square tails).

## Functions
- As Excel has them: F.TEST, Z.TEST, CHISQ.TEST, with the old names FTEST, ZTEST, CHITEST.
- Not in Excel, LibreOffice or Google Sheets, named with Excel's `.TEST` suffix:
  ANOVA.TEST(range1, range2, …), MANNWHITNEY.TEST(range1, range2), WILCOXON.TEST(range) or
  WILCOXON.TEST(range1, range2) (paired, rows as T.TEST's paired type), KS.TEST(range1, range2)
  (two-sample), SHAPIRO.TEST(range).

## Decisions
- Each returns the p value only, two-sided for the rank tests; the statistics wait for array results (#148).
- The exact or normal null distribution is chosen as scipy.stats does by default:
  - Mann-Whitney: exact when a sample has at most 8 values and nothing ties (and m·n ≤ 10^6);
    otherwise normal with the tie and continuity corrections.
  - Wilcoxon: zero differences dropped; exact for at most 50 differences, none zero and none tied;
    otherwise normal with the tie correction, no continuity correction. scipy also takes the exact
    distribution with ties; that distribution assumes no ties, so ties go to the normal one here.
  - Kolmogorov-Smirnov: exact by counting lattice paths (as the probability of first reaching the
    boundary, so a small p keeps its digits) up to 10^7 paths; Kolmogorov's limit beyond. scipy's
    large-sample form differs.
  - Shapiro-Wilk: Royston's AS R94 with an exact normal quantile and tail, as R's swilk.c. scipy keeps
    the published 7-digit quantile, so it agrees to about 1e-7.
- CHISQ.TEST: degrees of freedom from the shape ((r−1)(c−1), or the cells less one for a single row
  or column); tables of different shapes or a single cell #N/A; an expected 0 #DIV/0!.
- Too few values to test: #DIV/0!, as T.TEST. Z.TEST with no values #N/A and sigma ≤ 0 #NUM!.

## Verification
- `tests/tools/generate_hypothesis_tests_reference.py`: p values computed independently (mpmath tails,
  exact counts in Python integers, lattice paths counted, AS R94 at 50 digits), each checked against
  scipy.stats where it computes the same quantity.
- Microsoft's examples, the argument rules, and seeded properties (a two-group ANOVA equals T.TEST
  type 2; the two-sample tests are symmetric; SHAPIRO.TEST is shift and scale invariant; paired
  WILCOXON equals the one-sample test of the differences; Z.TEST mirrored sums to 1).
