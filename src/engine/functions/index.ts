/**
 * Spreadsheet Functions Index
 *
 * Imports all function categories to register them with the function registry.
 * Import this file to load all available spreadsheet functions.
 */

import "./statistical";
import "./statistical-analysis";
import "./regression";
import "./linest";
import "./time-series";
import "./distributions";
import "./distribution-families";
import "./hypothesis-tests";
import "./shape";
import "./descriptive";
import "./mathematical";
import "./logical";
import "./let-lambda";
import "./text";
import "./financial";
import "./lookup";
import "./array-functions";
import "./matrix";
import "./date";
import "./calendar";
// After every function it renames.
import "./aliases";

export { functionRegistry } from "../registry";
