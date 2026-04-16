import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sumClassificationCounts,
  computeSearchNoClickRatio,
  normalizeSdkResult,
} from "../src/su-core/business-query-helpers.js";

describe("business-query-helpers", () => {
  it("sumClassificationCounts sums count", () => {
    const { sum, rowCount } = sumClassificationCounts([
      { count: 10 },
      { count: "5" },
      {},
    ]);
    assert.equal(sum, 15);
    assert.equal(rowCount, 3);
  });

  it("computeSearchNoClickRatio divides sums", () => {
    const r = computeSearchNoClickRatio([{ count: 2 }, { count: 3 }], [{ count: 10 }]);
    assert.equal(r.numeratorSum, 5);
    assert.equal(r.denominatorSum, 10);
    assert.equal(r.ratio, 50);
  });

  it("computeSearchNoClickRatio handles zero denominator", () => {
    const r = computeSearchNoClickRatio([{ count: 1 }], []);
    assert.equal(r.ratio, null);
    assert.ok(r.note);
  });

  it("normalizeSdkResult maps success envelope", () => {
    const r = normalizeSdkResult({ status: true, data: { a: 1 } });
    assert.equal(r.ok, true);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.data, { a: 1 });
  });

  it("normalizeSdkResult maps axios-style failure", () => {
    const r = normalizeSdkResult({
      status: false,
      message: { response: { status: 401 }, message: "Unauthorized" },
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 401);
  });
});
