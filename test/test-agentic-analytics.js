import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { jsonTextResult, callSdk } from '../src/agentic/shared.js';
import { CASE_QA_REPORT_TYPES, handleCaseQaReport } from '../src/agentic/case-qa.js';
import { SUPPORT_AGENT_REPORT_TYPES, handleSupportAgentReport } from '../src/agentic/support-agent.js';
import { AGENT_PARTNER_REPORT_TYPES, handleAgentPartnerReport } from '../src/agentic/agent-partner.js';
import { LLM_USAGE_REPORT_TYPES, handleLlmUsageReport } from '../src/agentic/llm-usage.js';
import {
  AGENTIC_REPORT_TYPES,
  AGENTIC_REPORT_TYPE_SET,
  agenticAnalyticsFieldShape,
  handleAgenticAnalyticsReport,
} from '../src/agentic/index.js';

// --- shared.js: jsonTextResult / callSdk ---

describe('agentic/shared.js - jsonTextResult', () => {
  it('should wrap an object as MCP text content', () => {
    const result = jsonTextResult({ error: 'x', reportType: 'y' });
    assert.equal(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('"error": "x"'));
  });
});

describe('agentic/shared.js - callSdk', () => {
  it('should format successful responses via formatForClaude', async () => {
    const result = await callSdk('caseQaFilters', Promise.resolve({ status: true, data: [{ a: 1 }] }));
    assert.ok(result.content[0].text.includes('a: 1'));
  });

  it('should translate "You are not authorized" into a scope-specific message', async () => {
    const result = await callSdk(
      'caseQaFilters',
      Promise.resolve({
        status: false,
        message: { response: { data: { message: 'You are not authorized' } } },
      })
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.match(parsed.error, /AgenticAnalytics/);
  });

  it('should surface other API error messages as-is', async () => {
    const result = await callSdk(
      'caseQaFilters',
      Promise.resolve({ status: false, message: { response: { data: { message: 'Some error occurred' } } } })
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, 'Some error occurred');
  });

  it('should catch thrown/rejected errors from the SDK call', async () => {
    const result = await callSdk('caseQaFilters', Promise.reject(new Error('network fail')));
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, 'network fail');
  });

  it('should flag an empty response distinctly', async () => {
    const result = await callSdk('caseQaFilters', Promise.resolve({ status: true, data: null }));
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, 'empty_response');
  });
});

// --- Per-domain report type completeness ---

describe('Agentic Analytics report type counts', () => {
  it('should have 8 Case QA report types', () => {
    assert.equal(Object.keys(CASE_QA_REPORT_TYPES).length, 8);
  });

  it('should have 9 Support Agent report types', () => {
    assert.equal(Object.keys(SUPPORT_AGENT_REPORT_TYPES).length, 9);
  });

  it('should have 29 Agent Partner report types', () => {
    assert.equal(Object.keys(AGENT_PARTNER_REPORT_TYPES).length, 29);
  });

  it('should have 1 LLM Usage report type', () => {
    assert.equal(Object.keys(LLM_USAGE_REPORT_TYPES).length, 1);
  });

  it('should merge to 47 total in AGENTIC_REPORT_TYPES with no key collisions', () => {
    const domainTotal =
      Object.keys(CASE_QA_REPORT_TYPES).length +
      Object.keys(SUPPORT_AGENT_REPORT_TYPES).length +
      Object.keys(AGENT_PARTNER_REPORT_TYPES).length +
      Object.keys(LLM_USAGE_REPORT_TYPES).length;
    assert.equal(domainTotal, 47);
    assert.equal(Object.keys(AGENTIC_REPORT_TYPES).length, 47);
    assert.equal(AGENTIC_REPORT_TYPE_SET.size, 47);
  });

  it('should expose the agenticParams field in the shared field shape', () => {
    assert.ok(agenticAnalyticsFieldShape.agenticParams);
  });
});

// --- Per-domain dispatch ---

function mockSuRestClient(domainAccessor, methodName, resolvedValue) {
  const method = mock.fn(() => Promise.resolve(resolvedValue));
  return { suRestClient: { [domainAccessor]: () => ({ [methodName]: method }) }, method };
}

describe('handleCaseQaReport dispatch', () => {
  it('should dispatch caseQaFilters to CaseQa().getCaseQaFilters', async () => {
    const { suRestClient, method } = mockSuRestClient('CaseQa', 'getCaseQaFilters', { status: true, data: { ok: 1 } });
    const result = await handleCaseQaReport('caseQaFilters', { teamId: 't1' }, suRestClient);
    assert.equal(method.mock.calls.length, 1);
    assert.deepEqual(method.mock.calls[0].arguments[0], { teamId: 't1' });
    assert.ok(result.content[0].text.includes('ok: 1'));
  });

  it('should return null for a reportType outside its domain', async () => {
    const { suRestClient } = mockSuRestClient('CaseQa', 'getCaseQaFilters', {});
    const result = await handleCaseQaReport('supportAgentAgents', {}, suRestClient);
    assert.equal(result, null);
  });
});

describe('handleSupportAgentReport dispatch', () => {
  it('should dispatch supportAgentSessionTranscript to getSessionTranscript', async () => {
    const { suRestClient, method } = mockSuRestClient('SupportAgentAnalytics', 'getSessionTranscript', {
      status: true,
      data: { messages: [] },
    });
    await handleSupportAgentReport('supportAgentSessionTranscript', { sessionId: 's1' }, suRestClient);
    assert.equal(method.mock.calls.length, 1);
    assert.deepEqual(method.mock.calls[0].arguments[0], { sessionId: 's1' });
  });

  it('should return null for a reportType outside its domain', async () => {
    const { suRestClient } = mockSuRestClient('SupportAgentAnalytics', 'getAgents', {});
    const result = await handleSupportAgentReport('llmUsageDashboard', {}, suRestClient);
    assert.equal(result, null);
  });
});

describe('handleAgentPartnerReport dispatch', () => {
  it('should dispatch agentPartnerFeedbackExport to exportFeedbackReport', async () => {
    const { suRestClient, method } = mockSuRestClient('AgentPartnerAnalytics', 'exportFeedbackReport', {
      status: true,
      data: {},
    });
    await handleAgentPartnerReport('agentPartnerFeedbackExport', { filters: {} }, suRestClient);
    assert.equal(method.mock.calls.length, 1);
  });

  it('should return null for a reportType outside its domain', async () => {
    const { suRestClient } = mockSuRestClient('AgentPartnerAnalytics', 'getSearchClients', {});
    const result = await handleAgentPartnerReport('caseQaFilters', {}, suRestClient);
    assert.equal(result, null);
  });
});

describe('handleLlmUsageReport dispatch', () => {
  it('should dispatch llmUsageDashboard to getLlmUsageDashboard', async () => {
    const { suRestClient, method } = mockSuRestClient('LlmUsage', 'getLlmUsageDashboard', {
      status: true,
      data: { total: 1 },
    });
    await handleLlmUsageReport('llmUsageDashboard', { days: 7 }, suRestClient);
    assert.equal(method.mock.calls.length, 1);
    assert.deepEqual(method.mock.calls[0].arguments[0], { days: 7 });
  });

  it('should return null for a reportType outside its domain', async () => {
    const { suRestClient } = mockSuRestClient('LlmUsage', 'getLlmUsageDashboard', {});
    const result = await handleLlmUsageReport('caseQaFilters', {}, suRestClient);
    assert.equal(result, null);
  });
});

// --- Top-level aggregator ---

describe('handleAgenticAnalyticsReport (index.js aggregator)', () => {
  it('should return null for a reportType not in AGENTIC_REPORT_TYPE_SET (falls through to core)', async () => {
    const result = await handleAgenticAnalyticsReport('averageClickPosition', {}, { suRestClient: {} });
    assert.equal(result, null);
  });

  it('should route a known reportType to its domain handler with agenticParams unpacked', async () => {
    // handleCaseQaReport/handleSupportAgentReport/handleAgentPartnerReport are tried before
    // handleLlmUsageReport (see index.js's ?? chain), and each unconditionally calls its own
    // suRestClient.<Domain>() accessor before checking reportType - harmless with a real
    // SearchUnifyRestClient (always instantiates all four), so the mock needs all four too.
    const method = mock.fn(() => Promise.resolve({ status: true, data: { total: 42 } }));
    const suRestClient = {
      CaseQa: () => ({}),
      SupportAgentAnalytics: () => ({}),
      AgentPartnerAnalytics: () => ({}),
      LlmUsage: () => ({ getLlmUsageDashboard: method }),
    };
    const result = await handleAgenticAnalyticsReport(
      'llmUsageDashboard',
      { agenticParams: { days: 30 } },
      { suRestClient }
    );
    assert.equal(method.mock.calls.length, 1);
    assert.deepEqual(method.mock.calls[0].arguments[0], { days: 30 });
    assert.ok(result.content[0].text.includes('total: 42'));
  });

  it('should default agenticParams to {} when omitted', async () => {
    const method = mock.fn(() => Promise.resolve({ status: true, data: {} }));
    const suRestClient = { CaseQa: () => ({ getCqaInsights: method }) };
    await handleAgenticAnalyticsReport('caseQaInsights', {}, { suRestClient });
    assert.equal(method.mock.calls.length, 1);
  });
});

// --- Module imports (ESM sanity) ---

describe('Module imports', () => {
  it('should import src/agentic/index.js without error', async () => {
    const mod = await import('../src/agentic/index.js');
    assert.equal(typeof mod.handleAgenticAnalyticsReport, 'function');
  });

  it('should import su-core-analytics.js (consumer of src/agentic/index.js) without error', async () => {
    const mod = await import('../src/su-core/su-core-analytics.js');
    assert.ok(mod.initializeAnalyticsTools);
  });
});
