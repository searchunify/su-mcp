import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  initializeCustomReportsTools,
  defaultRangeDays,
  resolvePeriod,
  buildRunBody,
  compactReport,
  shapeRunResult,
  errorOf,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "../src/su-core/su-core-custom-reports.js";

const NOW = new Date("2026-11-18T10:00:00Z");

const REPORT = {
  id: "top_searches",
  name: "Top searches",
  description: "Most frequent queries",
  section: "overview",
  order: 3,
  widget: "table",
  chart: null,
  columns: [
    { key: "query", label: "Query", type: "text" },
    { key: "searches", label: "Searches", type: "number" },
  ],
  defaultSort: { by: "searches", dir: "desc" },
  defaultRange: "7d",
  pageSize: 10,
  filters: ["dateRange", "searchClient", "userType"],
  download: { csv: true },
  customFilters: [
    { name: "language", label: "Language", ui: "dropdown", operator: "in" },
    { name: "min_searches", label: "Minimum searches", ui: "number", operator: "gte" },
  ],
  materializedAs: "rollup",
  version: 4,
};

const sdkError = (status, data) => ({ status: false, message: { message: `Request failed with status code ${status}`, response: { status, data } } });

/* Registers the tools on a fake server and calls them with a fake SDK client. */
const setup = ({ authenticated = true, api = {} } = {}) => {
  const tools = {};
  const server = { tool: (name, description, schema, annotations, handler) => { tools[name] = { description, schema, annotations, handler }; } };
  const calls = [];
  const customReports = {
    listReports: async () => { calls.push(["list"]); return api.list ? api.list() : { status: true, data: { reports: [REPORT] } }; },
    runReport: async (body) => { calls.push(["run", body]); return api.run ? api.run(body) : { status: true, data: { reportId: body.reportId, widget: "table", columns: REPORT.columns, rows: [{ query: "sso", searches: 12 }], page: body.page, pageSize: body.pageSize, total: 1, totalPages: 1, dataTill: body.to } }; },
    getReportFilterOptions: async (params) => { calls.push(["options", params]); return api.options ? api.options(params) : { status: true, data: { options: [{ value: "en", label: "English" }], truncated: false } }; },
  };
  const creds = authenticated ? { suRestClient: { CustomReports: () => customReports } } : null;
  initializeCustomReportsTools({ server, creds, getCreds: null });
  const text = (result) => result.content[0].text;
  const json = (result) => JSON.parse(text(result));

  return { tools, calls, text, json };
};

describe("custom reports: helpers", () => {
  it("default range ends today and includes both days", () => {
    assert.deepEqual(defaultRangeDays("7d", NOW), { from: "2026-11-12", to: "2026-11-18" });
    assert.deepEqual(defaultRangeDays("30d", NOW), { from: "2026-10-20", to: "2026-11-18" });
    assert.deepEqual(defaultRangeDays("12m", NOW), { from: "2025-11-19", to: "2026-11-18" });
    assert.deepEqual(defaultRangeDays(undefined, NOW), { from: "2026-10-20", to: "2026-11-18" });
  });

  it("period: both dates, neither, or an error", () => {
    assert.deepEqual(resolvePeriod({ startDate: "2026-10-01", endDate: "2026-10-31" }, "7d", NOW), { from: "2026-10-01", to: "2026-10-31" });
    assert.deepEqual(resolvePeriod({}, "7d", NOW), { from: "2026-11-12", to: "2026-11-18" });
    assert.ok(resolvePeriod({ startDate: "2026-10-01" }, "7d", NOW).error);
    assert.ok(resolvePeriod({ startDate: "2026-10-31", endDate: "2026-10-01" }, "7d", NOW).error);
    assert.ok(resolvePeriod({ startDate: "2026-02-30", endDate: "2026-03-01" }, "7d", NOW).error);
    assert.ok(resolvePeriod({ startDate: "2025-01-01", endDate: "2026-10-01" }, "7d", NOW).error);
  });

  it("run body: all search clients unless some are named; page size 20 by default, at most 50", () => {
    const period = { from: "2026-10-01", to: "2026-10-31" };
    assert.deepEqual(buildRunBody({ reportId: " top_searches " }, period), {
      reportId: "top_searches", from: "2026-10-01", to: "2026-10-31", page: 1, pageSize: DEFAULT_PAGE_SIZE,
    });
    assert.equal(buildRunBody({ reportId: "r", pageSize: 500 }, period).pageSize, MAX_PAGE_SIZE);
    const full = buildRunBody({
      reportId: "r", page: 3, pageSize: 25, sortBy: "searches", sortDir: "asc", userType: "external",
      searchClientUids: ["a", " a ", "b", ""], customFilters: { language: ["en"] }, columnSearch: { query: "sso" },
    }, period);
    assert.deepEqual(full, {
      reportId: "r", from: "2026-10-01", to: "2026-10-31", page: 3, pageSize: 25, sortBy: "searches", sortDir: "asc",
      internalUser: "external", searchClients: ["a", "b"], custom: { language: ["en"] }, search: { query: "sso" },
    });
    assert.equal("tenantId" in full, false);
  });

  it("compact report has no definition internals", () => {
    const compact = compactReport(REPORT);
    assert.deepEqual(Object.keys(compact).sort(), ["columns", "customFilters", "defaultRange", "description", "id", "name", "section", "widget"]);
    assert.deepEqual(compact.customFilters[0], { name: "language", label: "Language", ui: "dropdown", hasOptions: true });
    assert.equal(compact.customFilters[1].hasOptions, false);
  });

  it("rows keyed by label, cut to the page size with notes", () => {
    const columns = [{ key: "day", label: "Day" }, { key: "a", label: "Count" }, { key: "b", label: "Count" }];
    const rows = Array.from({ length: 60 }, (_, i) => ({ day: `d${i}`, a: i, b: i * 2 }));
    const shaped = shapeRunResult({ reportId: "r", widget: "line", columns, rows, page: 1, totalPages: 1, total: 60, dataTill: "2026-10-30" }, { from: "2026-09-01", to: "2026-10-31" }, 50);
    assert.equal(shaped.rows.length, 50);
    assert.deepEqual(shaped.rows[1], { Day: "d1", a: 1, b: 2 });
    assert.equal(shaped.notes.length, 2);
    assert.match(shaped.notes[1], /up to 2026-10-30/);
  });

  it("errors: API message, missing route, refused credential", () => {
    assert.equal(errorOf(sdkError(404, { status: false, message: "Report 'x' not found" })).text, "Report 'x' not found");
    assert.match(errorOf(sdkError(404, "Cannot POST /api/v2/custom-reports/reports")).text, /not available/);
    assert.match(errorOf(sdkError(401, { message: "You are not authorized" })).text, /refused/);
  });
});

describe("custom reports: tools", () => {
  it("registers three read-only tools", () => {
    const { tools } = setup();
    assert.deepEqual(Object.keys(tools).sort(), ["get-custom-report-filter-options", "list-custom-reports", "run-custom-report"]);
    Object.values(tools).forEach((tool) => {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
    });
  });

  it("asks for login when not authenticated", async () => {
    const { tools, calls, text } = setup({ authenticated: false });
    assert.match(text(await tools["list-custom-reports"].handler({})), /login/);
    assert.match(text(await tools["run-custom-report"].handler({ reportId: "r", startDate: "2026-10-01", endDate: "2026-10-31" })), /login/);
    assert.equal(calls.length, 0);
  });

  it("lists compact reports and filters by words", async () => {
    const { tools, json } = setup();
    const all = json(await tools["list-custom-reports"].handler({}));
    assert.equal(all.reports.length, 1);
    assert.equal(all.reports[0].materializedAs, undefined);
    const none = json(await tools["list-custom-reports"].handler({ search: "deflection" }));
    assert.equal(none.reports.length, 0);
    assert.match(none.note, /1 reports exist/);
  });

  it("runs over all search clients with the report's default period when no dates are given", async () => {
    const { tools, calls, json } = setup();
    const result = json(await tools["run-custom-report"].handler({ reportId: "top_searches" }));
    const [, body] = calls.find(([name]) => name === "run");
    assert.equal(body.searchClients, undefined);
    assert.equal(body.pageSize, 20);
    assert.equal(body.to, new Date().toISOString().slice(0, 10));
    assert.deepEqual(result.rows, [{ Query: "sso", Searches: 12 }]);
  });

  it("does not list first when dates are given, and reports an unknown report", async () => {
    const { tools, calls, json } = setup({ api: { run: () => sdkError(404, { status: false, message: "Report 'nope' not found" }) } });
    const result = json(await tools["run-custom-report"].handler({ reportId: "nope", startDate: "2026-10-01", endDate: "2026-10-31" }));
    assert.equal(calls.some(([name]) => name === "list"), false);
    assert.equal(result.error, "Report 'nope' not found");

    const missing = json(await tools["run-custom-report"].handler({ reportId: "nope" }));
    assert.match(missing.error, /No published report/);
  });

  it("refuses a bad period without calling the instance", async () => {
    const { tools, calls, json } = setup();
    const result = json(await tools["run-custom-report"].handler({ reportId: "r", startDate: "2026-10-01" }));
    assert.match(result.error, /both startDate and endDate/);
    assert.equal(calls.length, 0);
  });

  it("lists the values of a custom filter", async () => {
    const { tools, calls, json } = setup();
    const result = json(await tools["get-custom-report-filter-options"].handler({ reportId: "top_searches", filterName: "language", search: " en " }));
    assert.deepEqual(calls[0], ["options", { reportId: "top_searches", name: "language", limit: 100, search: "en" }]);
    assert.deepEqual(result.options[0], { value: "en", label: "English" });
  });

  it("says custom reports are not available on an instance without them", async () => {
    const { tools, text, json } = setup({ api: { list: () => sdkError(404, "<html>Not Found</html>") } });
    const result = await tools["list-custom-reports"].handler({});
    assert.match(json(result).error || text(result), /not available/);
  });
});
