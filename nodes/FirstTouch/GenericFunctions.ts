import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Every FirstTouch Public API operation is POST /api/public/tools/{tool} with a JSON body.
export const BASE_URL = 'https://gateway.firsttouch.ai/api/public/tools';

type Ctx = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

// Drop empty strings / undefined / null so optional fields don't send "" to typed params.
export function clean(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(clean).filter((v) => v !== undefined);
	if (value && typeof value === 'object') {
		const out: IDataObject = {};
		for (const [k, v] of Object.entries(value as IDataObject)) {
			const c = clean(v);
			if (c !== undefined) out[k] = c as IDataObject;
		}
		return Object.keys(out).length ? out : undefined;
	}
	if (value === '' || value === undefined || value === null) return undefined;
	return value;
}

export async function callTool(
	this: Ctx,
	tool: string,
	body: IDataObject = {},
	opts: { raw?: boolean } = {},
): Promise<IDataObject> {
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'firstTouchApi', {
			method: 'POST',
			url: `${BASE_URL}/${tool}`,
			body: opts.raw ? body : ((clean(body) as IDataObject) ?? {}),
			json: true,
			headers: { Accept: 'application/json' },
		})) as IDataObject;
	} catch (error) {
		const e = error as JsonObject & { response?: { body?: IDataObject } };
		const data =
			(e.response && e.response.body) ||
			((e.cause as JsonObject | undefined)?.response as JsonObject | undefined)?.body ||
			undefined;
		const d = (data || {}) as IDataObject;
		const message = (d.message as string) || (d.error as string) || undefined;
		const trace = d.traceId ? ` [trace ${d.traceId}]` : '';
		throw new NodeApiError(this.getNode(), e, message ? { message: `${message}${trace}` } : {});
	}
}

const PROFILE_RX =
	/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:www\.)?linkedin\.com\/in\/([^/?#\s]+)/i;

// LinkedIn actions only work on a person's profile (linkedin.com/in/...).
export function personProfileUrl(this: IExecuteFunctions, raw: unknown, itemIndex: number): string {
	const s = String(raw ?? '').trim();
	const m = s.match(PROFILE_RX);
	if (!m) {
		throw new NodeOperationError(
			this.getNode(),
			`"${s || '(blank)'}" is not a LinkedIn profile URL for a person. Use a URL like https://www.linkedin.com/in/jane-doe (company pages and post links do not work).`,
			{ itemIndex },
		);
	}
	return `https://www.linkedin.com/in/${m[1]}`;
}

export const isoDaysAgo = (days: number) =>
	new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

// ---------- Dropdowns ----------
export async function getFlowPlans(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const out: INodePropertyOptions[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < 5; page++) {
		const res = await callTool.call(this, 'list_flow_plans', {
			limit: 100,
			cursor,
			orderBy: 'created',
			orderDirection: 'descending',
		});
		for (const f of (res.items as IDataObject[]) || []) {
			const name = f.name
				? `${f.name}${f.isDraft ? ' [draft]' : ''}`
				: `(untitled draft, created ${String(f.created || '').slice(0, 10)})`;
			out.push({ name, value: f.id as string });
		}
		if (!res.hasMore || !res.cursor) break;
		cursor = res.cursor as string;
	}
	const rank = (o: INodePropertyOptions) =>
		(o.name.startsWith('(untitled') ? 2 : 0) + (o.name.endsWith('[draft]') ? 1 : 0);
	return out.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map(({ o }) => o);
}

export async function getTeamMembers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const res = await callTool.call(this, 'list_team_members', {});
	return ((res.items as IDataObject[]) || []).map((m) => ({
		name: `${m.name || m.email} (${m.email})`,
		value: m.userId as string,
	}));
}

export async function getLinkedinAccounts(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const res = await callTool.call(this, 'list_team_members', { isLinkedinConnected: true });
	return ((res.items as IDataObject[]) || [])
		.filter((m) => m.linkedinAccount && (m.linkedinAccount as IDataObject).id)
		.map((m) => {
			const a = m.linkedinAccount as IDataObject;
			return { name: `${a.fullName || m.name} (${m.email})`, value: a.id as string };
		});
}

export async function getSignals(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const res = await callTool.call(this, 'list_social_engagement_signals', {});
	return ((res.signals as IDataObject[]) || []).map((s) => ({
		name: s.name as string,
		value: s.id as string,
	}));
}
