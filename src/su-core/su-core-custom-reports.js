import { z } from "zod";
import {
  listCustomReportsToolAnnotations,
  runCustomReportToolAnnotations,
  getCustomReportFilterOptionsToolAnnotations,
} from "../tool-annotations-meta.js";
import { log } from "../logger.js";

/**
 * Custom analytics reports (SPE-14461 v1.5), read only: list the published reports of the
 * connection's tenant, fetch the data of one, and list the values of one of its custom filters.
 * The instance takes the tenant from the credential; nothing here sends a tenant id. Report
 * definitions, schema routes and every write route are deliberately not exposed.
 *
 * Search clients: a report covers every search client unless the user names some
 * (searchClientUids). The connection's own search client uid is never applied.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_RANGE_DAYS = 366;
const USER_TYPES = ["all", "internal", "external", "externalOnly"];
const LISTED_FILTER_UIS = ["dropdown", "multiselect"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const NOT_AUTHENTICATED =
  "IMPORTANT: Not authenticated. You MUST call the 'login' tool first to get a login link for the user. Do not ask the user to go to settings — use the login tool.";
const NOT_AVAILABLE = "Custom reports are not available on this SearchUnify instance.";

const textResult = (text) => ({ content: [{ type: "text", text }] });
const jsonResult = (data) => textResult(JSON.stringify(data));

const ymd = (date) => date.toISOString().slice(0, 10);
const isDay = (value) =>
  typeof value === "string" && DAY.test(value) && ymd(new Date(`${value}T00:00:00Z`)) === value;
const daysBetween = (from, to) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;

/** The report's default range ('7d', '30d', '90d', '12m') ending today (UTC), both days included. */
export const defaultRangeDays = (preset, now = new Date()) => {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(today);
  const match = /^(\d+)([dm])$/.exec(typeof preset === "string" ? preset : "");
  if (match && match[2] === "m") {
    from.setUTCMonth(from.getUTCMonth() - Number(match[1]));
    from.setUTCDate(from.getUTCDate() + 1);
  } else {
    const days = match ? Number(match[1]) : 30;
    from.setUTCDate(from.getUTCDate() - (days - 1));
  }

  return { from: ymd(from), to: ymd(today) };
};

/**
 * The period of a run: startDate/endDate, or the report's default range when both are omitted.
 * @returns {{ from: string, to: string } | { error: string }}
 */
export const resolvePeriod = ({ startDate, endDate }, defaultRange, now = new Date()) => {
  if (!startDate && !endDate) return defaultRangeDays(defaultRange, now);
  if (!isDay(startDate) || !isDay(endDate)) {
    return { error: "Give both startDate and endDate as YYYY-MM-DD dates, or neither for the report's default range." };
  }
  if (startDate > endDate) return { error: "startDate must be on or before endDate." };
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
    return { error: `The period can be at most ${MAX_RANGE_DAYS} days.` };
  }

  return { from: startDate, to: endDate };
};

/** The run body of the API. searchClients only when the user named some: none means all. */
export const buildRunBody = (args, period) => {
  const pageSize = Math.min(Math.max(Number.parseInt(args.pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const body = {
    reportId: String(args.reportId).trim(),
    from: period.from,
    to: period.to,
    page: Math.max(Number.parseInt(args.page, 10) || 1, 1),
    pageSize,
  };
  if (args.sortBy) body.sortBy = String(args.sortBy);
  if (args.sortDir) body.sortDir = args.sortDir;
  if (args.userType) body.internalUser = args.userType;
  const uids = (args.searchClientUids || []).map((uid) => String(uid).trim()).filter(Boolean);
  if (uids.length) body.searchClients = [...new Set(uids)];
  if (args.customFilters && Object.keys(args.customFilters).length) body.custom = args.customFilters;
  if (args.columnSearch && Object.keys(args.columnSearch).length) body.search = args.columnSearch;

  return body;
};

/** What the model needs to pick a report: no definition, no internals. */
export const compactReport = (report) => ({
  id: report.id,
  name: report.name,
  ...(report.description ? { description: report.description } : {}),
  section: report.section || null,
  widget: report.widget,
  columns: (report.columns || []).map((column) => ({ key: column.key, label: column.label, type: column.type })),
  defaultRange: report.defaultRange,
  ...((report.customFilters || []).length
    ? {
        customFilters: report.customFilters.map((filter) => ({
          name: filter.name,
          label: filter.label,
          ui: filter.ui,
          hasOptions: LISTED_FILTER_UIS.includes(filter.ui),
        })),
      }
    : {}),
});

/**
 * Rows keyed by column label (the key when two columns share a label), at most pageSize rows:
 * chart reports return every bucket in one call, so they are cut too, with a note.
 */
export const shapeRunResult = (data, period, pageSize) => {
  const columns = data.columns || [];
  const seen = new Map();
  columns.forEach((column) => seen.set(column.label, (seen.get(column.label) || 0) + 1));
  const nameOf = (column) => (column.label && seen.get(column.label) === 1 ? column.label : column.key);
  const allRows = data.rows || [];
  const rows = allRows.slice(0, pageSize).map((row) => Object.fromEntries(
    columns.map((column) => [nameOf(column), row[column.key] === undefined ? null : row[column.key]])
  ));
  const notes = [];
  if (allRows.length > rows.length) {
    notes.push(`Only the first ${rows.length} of ${allRows.length} rows are shown; narrow the period to see the rest.`);
  }
  if (data.totalPages > data.page) notes.push(`More rows: page ${data.page} of ${data.totalPages}; call again with page ${data.page + 1}.`);
  if (data.dataTill && data.dataTill < period.to) notes.push(`Data is available up to ${data.dataTill}.`);

  return {
    reportId: data.reportId,
    period,
    widget: data.widget,
    total: data.total,
    page: data.page,
    totalPages: data.totalPages,
    ...(data.sortBy ? { sortBy: data.sortBy, sortDir: data.sortDir } : {}),
    ...(data.totals ? { totals: data.totals } : {}),
    rows,
    ...(notes.length ? { notes } : {}),
  };
};

/** The SDK answers a refused call with { status: false, message: <axios error> }. */
export const errorOf = (response) => {
  const httpStatus = response?.message?.response?.status;
  const body = response?.message?.response?.data;
  const apiMessage = body && typeof body === "object" ? body.message : null;
  if (httpStatus === 401 || httpStatus === 403) {
    return { httpStatus, text: "The SearchUnify credential was refused for custom reports. Check that it is valid and allowed to read analytics." };
  }
  // an instance without the custom reports API answers 404 without the API's own message
  if (httpStatus === 404 && !apiMessage) return { httpStatus, text: NOT_AVAILABLE };

  return { httpStatus, text: apiMessage || response?.message?.message || "The custom reports request failed." };
};

const initializeCustomReportsTools = async ({ server, creds, getCreds }) => {
  const credsForRequest = async () => (getCreds ? await getCreds() : creds);

  const call = async (label, run) => {
    const c = await credsForRequest();
    if (!c) {
      log(`[CustomReports] unauthenticated`);
      return textResult(NOT_AUTHENTICATED);
    }
    if (typeof c.suRestClient?.CustomReports !== "function") {
      log(`[CustomReports] su-sdk without CustomReports: upgrade su-sdk to 2.1.8 or later`);
      return textResult("Custom reports are not available on this MCP server yet.");
    }
    let response;
    try {
      response = await run(c.suRestClient.CustomReports());
    } catch (e) {
      // SDK validation
      log(`[CustomReports] ${label} refused before the call: ${e?.message ?? String(e)}`);
      return jsonResult({ error: e?.message ?? String(e) });
    }
    if (response?.status === false) {
      const { httpStatus, text } = errorOf(response);
      log(`[CustomReports] ${label} API error ${httpStatus ?? ""}: ${text}`);
      return jsonResult({ error: text });
    }

    return { data: response?.data };
  };

  server.tool(
    "list-custom-reports",
    "Lists the published custom analytics reports of this SearchUnify instance: id, name, description, page section, columns, default period and custom filters. Call it before run-custom-report and pick the report whose name and description match the user's request. Drafts are not listed.",
    {
      search: z.string().max(100).optional().describe("Optional words to match in the report name or description"),
    },
    listCustomReportsToolAnnotations,
    async ({ search }) => {
      const result = await call("list", (api) => api.listReports());
      if (!result.data && result.content) return result;
      const reports = (result.data?.reports || []).map(compactReport);
      const term = typeof search === "string" ? search.trim().toLowerCase() : "";
      const matched = term
        ? reports.filter((r) => `${r.name} ${r.description || ""}`.toLowerCase().includes(term))
        : reports;
      log(`[CustomReports] list: ${matched.length} of ${reports.length} reports`);
      if (!reports.length) return textResult("There are no published custom reports on this instance.");

      return jsonResult({ reports: matched, ...(term && !matched.length ? { note: `No report matches '${search}'; ${reports.length} reports exist.` } : {}) });
    }
  );

  server.tool(
    "run-custom-report",
    `Fetches the data of one published custom report. Use the id from list-custom-reports. Without startDate and endDate the report's default period ending today is used. Covers every search client unless searchClientUids is given. Returns at most ${MAX_PAGE_SIZE} rows per call (default ${DEFAULT_PAGE_SIZE}); use page for more.`,
    {
      reportId: z.string().min(1).describe("Report id from list-custom-reports"),
      startDate: z.string().optional().describe("Start day YYYY-MM-DD (with endDate)"),
      endDate: z.string().optional().describe("End day YYYY-MM-DD (with startDate)"),
      searchClientUids: z.array(z.string()).optional().describe("Only these search clients (uids from get-search-clients). Omit for all search clients"),
      userType: z.enum(USER_TYPES).optional().describe("Users to include: all (default), internal, external, externalOnly"),
      page: z.number().int().min(1).optional().describe("Page number, from 1"),
      pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional().describe(`Rows per page, at most ${MAX_PAGE_SIZE} (default ${DEFAULT_PAGE_SIZE})`),
      sortBy: z.string().optional().describe("Column key to sort a table report by"),
      sortDir: z.enum(["asc", "desc"]).optional(),
      customFilters: z.record(z.any()).optional().describe("Custom filter name -> value, names from list-custom-reports; values of dropdown filters from get-custom-report-filter-options"),
      columnSearch: z.record(z.string()).optional().describe("Searchable column key -> text"),
    },
    runCustomReportToolAnnotations,
    async (args) => {
      let defaultRange;
      if (!args.startDate && !args.endDate) {
        const listed = await call("run/list", (api) => api.listReports());
        if (!listed.data && listed.content) return listed;
        const report = (listed.data?.reports || []).find((r) => r.id === String(args.reportId).trim());
        if (!report) return jsonResult({ error: `No published report with id '${args.reportId}'. Call list-custom-reports for the ids.` });
        defaultRange = report.defaultRange;
      }
      const period = resolvePeriod(args, defaultRange);
      if (period.error) return jsonResult({ error: period.error });
      const body = buildRunBody(args, period);
      const result = await call("run", (api) => api.runReport(body));
      if (!result.data && result.content) return result;
      log(`[CustomReports] run ${body.reportId} ${period.from}..${period.to} page ${body.page}`);

      return jsonResult(shapeRunResult(result.data || {}, period, body.pageSize));
    }
  );

  server.tool(
    "get-custom-report-filter-options",
    "Lists the values a dropdown or multiselect custom filter of a published report accepts (filters with hasOptions true in list-custom-reports), so run-custom-report gets valid customFilters values.",
    {
      reportId: z.string().min(1).describe("Report id from list-custom-reports"),
      filterName: z.string().min(1).describe("Custom filter name from list-custom-reports"),
      search: z.string().max(100).optional().describe("Optional text the values should contain"),
    },
    getCustomReportFilterOptionsToolAnnotations,
    async ({ reportId, filterName, search }) => {
      const params = { reportId: reportId.trim(), name: filterName.trim(), limit: 100 };
      if (search && search.trim()) params.search = search.trim();
      const result = await call("filter-options", (api) => api.getReportFilterOptions(params));
      if (!result.data && result.content) return result;

      return jsonResult(result.data);
    }
  );
};

export { initializeCustomReportsTools };
