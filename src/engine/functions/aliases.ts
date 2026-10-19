/**
 * The names current Excel writes for functions this engine already has. A model
 * writing `PERCENTILE.INC` means exactly `PERCENTILE`, so each alias is the same
 * definition under a second name.
 */

import { functionRegistry } from "../registry";

const ALIASES: Readonly<Record<string, string>> = {
  "PERCENTILE.INC": "PERCENTILE",
  "QUARTILE.INC": "QUARTILE",
  "STDEV.S": "STDEV",
  "STDEV.P": "STDEVP",
  "VAR.S": "VAR",
  "VAR.P": "VARP",
  "RANK.EQ": "RANK",
  TTEST: "T.TEST",
  PERCENTRANK: "PERCENTRANK.INC",
  FORECAST: "FORECAST.LINEAR",
  PEARSON: "CORREL",
};

Object.entries(ALIASES).forEach(([alias, name]) => {
  const definition = functionRegistry.get(name);
  if (!definition) throw new Error(`alias ${alias} names ${name}, which is not registered`);
  functionRegistry.register({ ...definition, name: alias, description: `Same as ${name}`, examples: [] });
});
