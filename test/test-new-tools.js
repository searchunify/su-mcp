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
    sessionList: "sessionList",
    tileDataContent: "tileDataContent",
    overviewSessionCount: "overviewSessionCount",
    overviewTileDataCount: "overviewTileDataCount",
    traffic: "traffic",
    search_no_click_pct: "search_no_click_pct",
    relevance_rate: "relevance_rate",
    content_gap: "content_gap",
    self_solve_rate: "self_solve_rate",
  };

  it('should include averageClickPosition report type', () => {
    assert.ok(reportTypes.averageClickPosition);
    assert.equal(reportTypes.averageClickPosition, 'averageClickPosition');
  });

  it('should include sessionDetails report type', () => {
    assert.ok(reportTypes.sessionDetails);
    assert.equal(reportTypes.sessionDetails, 'sessionDetails');
  });

  it('should include sessionList report type', () => {
    assert.ok(reportTypes.sessionList);
    assert.equal(reportTypes.sessionList, 'sessionList');
  });

  it('should have 16 report types total', () => {
    assert.equal(Object.keys(reportTypes).length, 16);
  });

  it('zod enum should accept new report types', () => {
    const schema = z.enum(Object.values(reportTypes));
    assert.equal(schema.parse('averageClickPosition'), 'averageClickPosition');
    assert.equal(schema.parse('sessionDetails'), 'sessionDetails');
    assert.equal(schema.parse('sessionList'), 'sessionList');
    assert.equal(schema.parse('tileDataContent'), 'tileDataContent');
    assert.equal(schema.parse('overviewSessionCount'), 'overviewSessionCount');
    assert.equal(schema.parse('overviewTileDataCount'), 'overviewTileDataCount');
    assert.equal(schema.parse('traffic'), 'traffic');
    assert.equal(schema.parse('self_solve_rate'), 'self_solve_rate');
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
    pageNumber: z.number().min(1).max(500).optional(),
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

  it('should accept sessionList report type with sessionId', () => {
    const result = analyticsSchema.parse({
      reportType: 'sessionList',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 50,
      sessionId: '1649742483444046',
    });
    assert.equal(result.reportType, 'sessionList');
  });

  it('should reject count greater than 500', () => {
    assert.throws(() => analyticsSchema.parse({
      reportType: 'sessionDetails',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 501,
    }));
  });

  it('should reject pageNumber greater than 500', () => {
    assert.throws(() => analyticsSchema.parse({
      reportType: 'getAllSearchQuery',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      count: 100,
      pageNumber: 501,
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

  it('should include every top-level array when object has multiple (conversion summary)', () => {
    const data = {
      total: [{ count: 696 }],
      searchSessions: [
        { text_entered: 'api', users: 2, sessions: 4, count: 4 },
        { text_entered: 'join', users: 4, sessions: 4, count: 4 },
      ],
    };
    const result = formatForClaude(data);
    const text = result.content[0].text;
    assert.ok(text.includes('total:'), 'labels total section');
    assert.ok(text.includes('count: 696'), 'total row');
    assert.ok(text.includes('searchSessions:'), 'labels searchSessions section');
    assert.ok(text.includes('text_entered: api'), 'first session row');
    assert.ok(text.includes('text_entered: join'), 'second session row');
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

  it('should import executive business query module without error', async () => {
    const mod = await import('../src/su-core/su-core-business-queries.js');
    assert.ok(mod.initializeExecutiveBusinessQueryTools);
    assert.equal(typeof mod.initializeExecutiveBusinessQueryTools, 'function');
  });
});
