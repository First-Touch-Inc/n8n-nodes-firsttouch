'use strict';
// Offline test of FirstTouchTrigger.poll() against the built node, with a fake n8n context.
// Run: npm run build && node --test test/
const test = require('node:test');
const assert = require('node:assert');
const { FirstTouchTrigger } = require('../dist/nodes/FirstTouch/FirstTouchTrigger.node.js');

const conn = (id, at) => ({
	owner: { userId: 'u1', name: 'Sam', email: 's@x.com' },
	linkedinAccount: { linAccountId: 'la1' },
	connection: { memberId: id, fullName: id, connectedAtUtc: at, publicProfileUrl: `https://www.linkedin.com/in/${id}` },
});

function ctx(responses, { mode = 'trigger', staticData = {} } = {}) {
	const calls = [];
	let i = 0;
	return {
		calls,
		staticData,
		getMode: () => mode,
		getNode: () => ({ name: 'FirstTouch Trigger' }),
		getNodeParameter: (name, fallback) => ({ event: 'connectionAccepted' })[name] ?? fallback,
		getWorkflowStaticData: () => staticData,
		helpers: {
			httpRequestWithAuthentication: async (_cred, req) => {
				calls.push(req.body);
				return { connections: { items: responses[Math.min(i++, responses.length - 1)] } };
			},
		},
	};
}

const node = new FirstTouchTrigger();

test('first activation records existing events and emits nothing', async () => {
	const c = ctx([[conn('a', '2026-11-20T00:00:00Z'), conn('b', '2026-11-21T00:00:00Z')]]);
	assert.strictEqual(await node.poll.call(c), null);
	assert.deepStrictEqual(c.staticData.seen.sort(), ['la1:a', 'la1:b']);
});

test('later polls emit only new events, oldest first, exactly once', async () => {
	const old = [conn('a', '2026-11-20T00:00:00Z'), conn('b', '2026-11-21T00:00:00Z')];
	const c = ctx([old, [conn('c', '2026-11-23T00:00:00Z'), conn('d', '2026-11-22T00:00:00Z'), ...old], [conn('c', '2026-11-23T00:00:00Z'), conn('d', '2026-11-22T00:00:00Z'), ...old]]);
	assert.strictEqual(await node.poll.call(c), null); // first run: record only
	const out = await node.poll.call(c);
	assert.deepStrictEqual(out[0].map((x) => x.json.id), ['la1:d', 'la1:c']);
	assert.strictEqual(out[0][0].json._id, undefined);
	assert.strictEqual(out[0][0].json.linkedinUrl, 'https://www.linkedin.com/in/d');
	assert.strictEqual(await node.poll.call(c), null); // same data again: nothing
});

test('manual "fetch test event" returns the newest item and leaves state alone', async () => {
	const c = ctx([[conn('a', '2026-11-20T00:00:00Z'), conn('b', '2026-11-21T00:00:00Z')]], { mode: 'manual' });
	const out = await node.poll.call(c);
	assert.deepStrictEqual(out[0].map((x) => x.json.id), ['la1:b']);
	assert.strictEqual(c.staticData.seen, undefined);
});

test('remembered ids are capped', async () => {
	const many = Array.from({ length: 2500 }, (_, k) => conn(`m${k}`, `2026-11-2${k % 9}T00:00:00Z`));
	const c = ctx([many]);
	await node.poll.call(c);
	assert.ok(c.staticData.seen.length <= 2000);
});
