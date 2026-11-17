import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { withUsageTracking, trackContextFor } from "../src/usage-context.js";

/** Minimal stand-in for McpServer: records the handler passed to tool(). */
const fakeServer = () => {
  const registered = {};
  return {
    registered,
    tool(...args) {
      registered[args[0]] = args[args.length - 1];
    },
  };
};

describe("withUsageTracking", () => {
  it("exposes tool name, a call id and the end-user email to the SDK context", async () => {
    const server = withUsageTracking(fakeServer());
    const ctx = trackContextFor("owner@acme.com");
    let seen;
    server.tool("search", "desc", {}, {}, async () => { seen = ctx(); return "ok"; });

    const out = await server.registered.search({ searchString: "abc", userInfo: { email: "end@acme.com" } }, {});
    assert.equal(out, "ok");
    assert.equal(seen.tool, "search");
    assert.match(seen.callId, /^[0-9a-f-]{36}$/);
    assert.equal(seen.user, "end@acme.com");
  });

  it("falls back to the authenticated user's email", async () => {
    const server = withUsageTracking(fakeServer());
    const ctx = trackContextFor("owner@acme.com");
    let seen;
    server.tool("get-search-clients", "desc", async () => { seen = ctx(); });
    await server.registered["get-search-clients"]({});
    assert.equal(seen.user, "owner@acme.com");
  });

  it("gives every call its own id, even when concurrent", async () => {
    const server = withUsageTracking(fakeServer());
    const ctx = trackContextFor(null);
    const ids = [];
    server.tool("search", "desc", {}, async () => {
      await new Promise((r) => setTimeout(r, 5));
      ids.push(ctx().callId);
    });
    await Promise.all([server.registered.search({}), server.registered.search({})]);
    assert.equal(new Set(ids).size, 2);
  });

  it("returns an empty context outside a tool call", () => {
    assert.deepEqual(trackContextFor("x@y.com")(), {});
  });

  it("propagates handler errors unchanged", async () => {
    const server = withUsageTracking(fakeServer());
    server.tool("search", "desc", {}, async () => { throw new Error("boom"); });
    await assert.rejects(() => server.registered.search({}), /boom/);
  });
});
