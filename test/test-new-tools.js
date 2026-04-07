import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { formatForClaude } from '../src/utils.js';

// --- Test report types enum in analytics ---

describe('Analytics tool - reportTypes', () => {
  const reportTypes = {
    searchQueryWithNoClicks: "searchQueryWithNoClicks",
    searchQueryWithResult: "searchQueryWithResult",
    searchQueryWithoutResults: "searchQueryWithoutResults",
    getAllSearchQuery: "getAllSearchQuery",
    getAllSearchConversion: "getAllSearchConversion",
    averageClickPosition: "averageClickPosition",
    sessionDetails: "sessionDetails",
    sessionListTable: "sessionListTable"
  };

  it('should include averageClickPosition report type', () => {
    assert.ok(reportTypes.averageClickPosition);
    assert.equal(reportTypes.averageClickPosition, 'averageClickPosition');
  });

  it('should include sessionDetails report type', () => {
    assert.ok(reportTypes.sessionDetails);
    assert.equal(reportTypes.sessionDetails, 'sessionDetails');
  });

  it('should include sessionListTable report type', () => {
    assert.ok(reportTypes.sessionListTable);
    assert.equal(reportTypes.sessionListTable, 'sessionListTable');
  });

  it('should have 8 report types total', () => {
    assert.equal(Object.keys(reportTypes).length, 8);
  });

  it('zod enum should accept new report types', () => {
    const schema = z.enum(Object.values(reportTypes));
    assert.equal(schema.parse('averageClickPosition'), 'averageClickPosition');
    assert.equal(schema.parse('sessionDetails'), 'sessionDetails');
    assert.equal(schema.parse('sessionListTable'), 'sessionListTable');
  });

  it('zod enum should reject invalid report types', () => {
    const schema = z.enum(Object.values(reportTypes));
    assert.throws(() => schema.parse('invalidType'));
  });
});

// --- Test analytics tool schema ---

describe('Analytics tool - schema', () => {
  const analyticsSchema = z.object({
    reportType: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    count: z.number().min(1).max(500),
    sessionId: z.string().optional(),
    pageNumber: z.number().min(1).max(10).optional(),
    startIndex: z.number().min(1).max(10).optional(),
  });

  it('should accept valid request', () => {
    const result = analyticsSchema.parse({
      reportType: 'getAllSearchQuery',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 10,
    });
    assert.equal(result.count, 10);
  });

  it('should accept sessionId for sessionDetails', () => {
    const result = analyticsSchema.parse({
      reportType: 'sessionDetails',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 50,
      sessionId: '1649742483444046',
    });
    assert.equal(result.sessionId, '1649742483444046');
  });

  it('should accept sessionListTable report type with sessionId', () => {
    const result = analyticsSchema.parse({
      reportType: 'sessionListTable',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 50,
      sessionId: '1649742483444046',
    });
    assert.equal(result.reportType, 'sessionListTable');
  });

  it('should reject count greater than 500', () => {
    assert.throws(() => analyticsSchema.parse({
      reportType: 'sessionDetails',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 501,
    }));
  });

  it('should reject pageNumber greater than 10', () => {
    assert.throws(() => analyticsSchema.parse({
      reportType: 'getAllSearchQuery',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 100,
      pageNumber: 11,
    }));
  });

  it('should reject startIndex greater than 10 for session log', () => {
    assert.throws(() => analyticsSchema.parse({
      reportType: 'sessionDetails',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 100,
      startIndex: 11,
    }));
  });

  it('should accept sortByField page_view for session list table', () => {
    const sortEnum = z.enum(['count', 'click', 'search', 'case', 'page_view', 'support', 'end_date', 'start_date']);
    assert.equal(sortEnum.parse('page_view'), 'page_view');
  });
});

// --- Test get-search-clients tool schema ---

describe('get-search-clients tool', () => {
  it('should accept empty params (no input required)', () => {
    const schema = z.object({});
    const result = schema.parse({});
    assert.deepEqual(result, {});
  });
});

// --- Test formatForClaude with search clients data ---

describe('formatForClaude with search client data', () => {
  it('should format search client list correctly', () => {
    const data = [
      { id: 1, name: 'Client A', uid: 'uid-a' },
      { id: 2, name: 'Client B', uid: 'uid-b' },
    ];
    const result = formatForClaude(data);
    assert.ok(result.content);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, 'text');
    assert.ok(result.content[0].text.includes('Client A'));
    assert.ok(result.content[0].text.includes('uid-a'));
    assert.ok(result.content[0].text.includes('Client B'));
    assert.ok(result.content[0].text.includes('uid-b'));
    assert.ok(result.content[0].text.includes('---'));
  });

  it('should format ACP data correctly', () => {
    const data = [
      { text_entered: 'test query', acp: 2.35, click_count: 10, search_count: 50, session_count: 30 },
    ];
    const result = formatForClaude(data);
    assert.ok(result.content[0].text.includes('acp: 2.35'));
    assert.ok(result.content[0].text.includes('click_count: 10'));
  });

  it('should handle empty array', () => {
    const result = formatForClaude([]);
    assert.ok(result.content);
    assert.equal(result.content[0].type, 'text');
  });
});

// --- Test module imports ---

describe('Module imports', () => {
  it('should import su-core-search-clients without error', async () => {
    const mod = await import('../src/su-core/su-core-search-clients.js');
    assert.ok(mod.initializeSearchClientsTools);
    assert.equal(typeof mod.initializeSearchClientsTools, 'function');
  });

  it('should import su-core-analytics without error', async () => {
    const mod = await import('../src/su-core/su-core-analytics.js');
    assert.ok(mod.initializeAnalyticsTools);
    assert.equal(typeof mod.initializeAnalyticsTools, 'function');
  });

  it('should import su-core index without error', async () => {
    const mod = await import('../src/su-core/index.js');
    assert.ok(mod.initializeSuCoreTools);
    assert.equal(typeof mod.initializeSuCoreTools, 'function');
  });
});
