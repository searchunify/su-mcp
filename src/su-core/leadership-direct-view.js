import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { HttpRequest, requestMethods } = require("su-sdk/src/utils/request-handler.js");
const { Authentication } = require("su-sdk/src/utils/authentication.js");

const CASE_DEFLECTION_FORMULA_AND_SETTINGS = "/api/v2/conversion/caseDeflectionFormulaAndSettings";

function restClientProps(credsForRequest) {
  const { uid: _uid, ...props } = credsForRequest.config;
  return { ...props, sendMcpConsumptionTrack: true };
}

function caseDeflectionSettingsBody(args, credsForRequest) {
  const internalUser = args.internalUser ?? "all";
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  const to = end.toISOString().slice(0, 10);
  const from = start.toISOString().slice(0, 10);
  const body = {
    from: `${from} 00:00:00`,
    to: `${to} 23:59:59`,
    internalUser,
  };
  if (args.ecoSystemId) {
    body.ecoId = args.ecoSystemId;
    body.uid = null;
  } else {
    const raw = args.uid;
    const uid =
      raw != null && String(raw).trim() !== ""
        ? String(raw).trim()
        : credsForRequest.config.uid;
    body.uid = uid;
    body.ecoId = null;
  }
  return body;
}

/** Admin Leadership USSV parity: `directly_viewed_results === 1` → true, else false. */
function toDirectlyViewSetting(directViewEnabled) {
  return directViewEnabled === true || directViewEnabled === 1;
}

/**
 * Resolve USSV `directlyViewSetting` from search client deflection config (admin uses
 * `GET /searchClientAnalytics/getDirectViewEnabled`; analytics exposes the same flag
 * on POST `/conversion/caseDeflectionFormulaAndSettings` as `directViewEnabled`).
 */
export async function resolveDirectlyViewSetting(credsForRequest, args) {
  const instance = String(credsForRequest.config.instance || "").replace(/\/$/, "");
  const auth = new Authentication(restClientProps(credsForRequest));
  const response = await HttpRequest(
    {
      timeout: credsForRequest.config.timeout ?? 60000,
      method: requestMethods.post,
      url: `${instance}${CASE_DEFLECTION_FORMULA_AND_SETTINGS}`,
      data: caseDeflectionSettingsBody(args, credsForRequest),
    },
    auth
  );
  if (response?.status === false) {
    console.error(
      "leadership-direct-view: caseDeflectionFormulaAndSettings failed:",
      response.message || response
    );
    return false;
  }
  const settings = response?.data;
  if (!settings || typeof settings !== "object") {
    return false;
  }
  return toDirectlyViewSetting(settings.directViewEnabled);
}
