import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sumClassificationCounts,
  computeSearchNoClickRatio,
  normalizeSdkResult,
  sumTopLevelContentSourceClicks,
  sumTopLevelClicksForHints,
  sumTopLevelClicksExcludingHints,
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

  it("normalizeSdkResult maps 404 to not-present-in-this-release guidance", () => {
    const r = normalizeSdkResult({
      status: false,
      message: {
        response: { status: 404 },
        message: "Request failed with status code 404",
        config: { url: "https://example.com/api/v2/overview/readAnswers" },
      },
    });
    assert.equal(r.ok, false);
    assert.equal(r.statusCode, 404);
    assert.equal(r.errorCode, "analytics_endpoint_not_available");
    assert.ok(r.userMessage.includes("not present in this release"));
    assert.ok(r.modelGuidance.includes("not present in this release"));
    assert.equal(r.requestUrl, "https://example.com/api/v2/overview/readAnswers");
  });

  it("sumTopLevelContentSourceClicks sums Data__1", () => {
    const rows = [
      { Name__1: "A", Data__1: 3 },
      { Name__1: "B", Data__1: 7 },
    ];
    assert.equal(sumTopLevelContentSourceClicks(rows), 10);
  });

  it("sumTopLevelClicksForHints matches substring", () => {
    const rows = [
      { Name__1: "StackOverflow2", Data__1: 3 },
      { Name__1: "KB Article", Data__1: 10 },
    ];
    assert.equal(sumTopLevelClicksForHints(rows, ["stack"]), 3);
    assert.equal(sumTopLevelClicksForHints(rows, []), null);
  });

  it("sumTopLevelClicksExcludingHints subtracts community slice", () => {
    const rows = [
      { Name__1: "Community X", Data__1: 4 },
      { Name__1: "Docs", Data__1: 6 },
    ];
    assert.equal(sumTopLevelClicksExcludingHints(rows, ["community"]), 6);
  });
});
