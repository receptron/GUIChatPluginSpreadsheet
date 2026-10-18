# 日付の関数と .INC の名前（#73）

- 日付：`WEEKDAY`（戻り値の型 1・2・3・11〜17）、`DAYS`、`EDATE`、`EOMONTH`、`WORKDAY`、`NETWORKDAYS`。決まりは `src/engine/date-calendar.ts`（純粋な関数）、引数の読み方は `src/engine/functions/calendar.ts`。祝日は範囲でも一つの日付でもよい。
- `.` の付いた名前：`PERCENTILE.INC` `QUARTILE.INC` `STDEV.S` `STDEV.P` `VAR.S` `VAR.P` `RANK.EQ` を、今ある関数の別名として登録する（`src/engine/functions/aliases.ts`）。
- 関数の名前の形を `FUNCTION_NAME_SOURCE`（`registry.ts`）一つにし、評価器の 2 か所と `cellBuilder` がそこから正規表現を作る。英字だけを `.` でつないだ名前は、登録が無くても呼び出しとみなす（無ければ `#NAME?`）。

## 確かめたこと

- `tests/engine/test_dateCalendar.ts`：期待値は Microsoft の説明にある計算例。
- `.` の無い式の答えが変わらないこと：関数・四則演算・小数・文字を混ぜた生成した式で、公開済みの 4.1.0 と比べた。二つの種で一致した。
- README の一覧と registry を照らし合わせるテストを、`.` の付いた名前も読めるようにした。

## やらないこと

- `.EXC` の付いた関数。
