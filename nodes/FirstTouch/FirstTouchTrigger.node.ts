import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { callTool, getLinkedinAccounts, getSignals, getTeamMembers, isoDaysAgo } from './GenericFunctions';

// Polling trigger. FirstTouch has no webhook-subscribe API yet, so each poll lists recent events
// and this node remembers which event ids it already emitted (in workflow static data).
// The first activation only records what exists, so old events never flood a new workflow.

const MAX_SEEN = 2000;

type Row = IDataObject & { _id: string; _at: string };

async function fetchRows(this: IPollFunctions, event: string): Promise<Row[]> {
	if (event === 'reply') {
		const tag = this.getNodeParameter('tag', '') as string;
		const res = await callTool.call(this, 'list_linkedin_unibox_conversations', {
			limit: 100,
			archived: false,
			tags: tag ? [tag] : undefined,
			linAccountId: this.getNodeParameter('linAccountId', '') as string,
		});
		return ((res.conversations as IDataObject[]) || [])
			.filter((c) => c.lastInboundMessageAtUtc)
			.map((c) => ({
				...c,
				replyIsLatestMessage: c.latestMessageAtUtc === c.lastInboundMessageAtUtc,
				_id: `${c.conversationId}:${c.lastInboundMessageAtUtc}`,
				_at: String(c.lastInboundMessageAtUtc),
			}));
	}
	if (event === 'connectionAccepted') {
		const ownerUserId = this.getNodeParameter('ownerUserId', '') as string;
		const res = await callTool.call(this, 'list_linkedin_team_connections', {
			mode: ownerUserId ? 'connections_of_team_member' : undefined,
			ownerUserId,
			connectedFromUtc: isoDaysAgo(7),
			limit: 100,
		});
		return ((((res.connections as IDataObject) || {}).items as IDataObject[]) || []).map((row) => {
			const c = (row.connection as IDataObject) || {};
			const o = (row.owner as IDataObject) || {};
			const a = (row.linkedinAccount as IDataObject) || {};
			return {
				connectedAtUtc: c.connectedAtUtc,
				fullName: c.fullName,
				firstName: c.firstName,
				lastName: c.lastName,
				headline: c.headline,
				linkedinUrl: c.publicProfileUrl,
				publicIdentifier: c.publicIdentifier,
				teammateUserId: o.userId,
				teammateName: o.name,
				teammateEmail: o.email,
				linAccountId: a.linAccountId,
				_id: `${a.linAccountId}:${c.memberId || c.publicIdentifier}`,
				_at: String(c.connectedAtUtc),
			};
		});
	}
	// engager
	const engagementType = this.getNodeParameter('engagementType', '') as string;
	const res = await callTool.call(this, 'list_social_engagement_engagers', {
		signalId: this.getNodeParameter('signalId') as string,
		engagementType,
		engagedFromUtc: isoDaysAgo(7),
		limit: 100,
	});
	return ((((res.engagers as IDataObject) || {}).items as IDataObject[]) || []).map((e) => ({
		...e,
		_id: String(e.id),
		_at: String(e.engaged_at),
	}));
}

export class FirstTouchTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FirstTouch Trigger',
		name: 'firstTouchTrigger',
		icon: { light: 'file:firsttouch.svg', dark: 'file:firsttouch.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow on new LinkedIn replies, accepted connections or post engagers in FirstTouch',
		defaults: { name: 'FirstTouch Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'firstTouchApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				default: 'reply',
				options: [
					{ name: 'Connection Accepted', value: 'connectionAccepted', description: 'Someone accepted a connection request and is now connected to a teammate' },
					{ name: 'New LinkedIn Reply', value: 'reply', description: 'A prospect replied on LinkedIn (any conversation in the FirstTouch inbox)' },
					{ name: 'New Social Engager', value: 'engager', description: 'Someone reacted to or commented on a profile or page monitored by a signal' },
				],
			},
			{
				displayName: 'Only Conversations Tagged',
				name: 'tag',
				type: 'options',
				default: '',
				options: [
					{ name: 'Any', value: '' },
					{ name: 'Hot', value: 'hot' },
					{ name: 'Nurture', value: 'nurture' },
				],
				displayOptions: { show: { event: ['reply'] } },
			},
			{
				displayName: 'LinkedIn Account Name or ID',
				name: 'linAccountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getLinkedinAccounts' },
				default: '',
				description:
					"Only replies to this teammate's LinkedIn account. Leave blank for every account you can access. Choose from the list, or specify an ID using an <a href=\"https://docs.n8n.io/code/expressions/\">expression</a>.",
				displayOptions: { show: { event: ['reply'] } },
			},
			{
				displayName: 'Teammate Name or ID',
				name: 'ownerUserId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTeamMembers' },
				default: '',
				description:
					'Only this teammate\'s new connections. Leave blank for everyone you can access. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { event: ['connectionAccepted'] } },
			},
			{
				displayName: 'Signal Name or ID',
				name: 'signalId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSignals' },
				default: '',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				displayOptions: { show: { event: ['engager'] } },
			},
			{
				displayName: 'Engagement Type',
				name: 'engagementType',
				type: 'options',
				default: '',
				options: [
					{ name: 'Comments', value: 'comment' },
					{ name: 'Reactions', value: 'reaction' },
					{ name: 'Reactions and Comments', value: '' },
				],
				displayOptions: { show: { event: ['engager'] } },
			},
		],
	};

	methods = { loadOptions: { getLinkedinAccounts, getSignals, getTeamMembers } };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const rows = (await fetchRows.call(this, event)).sort((a, b) => b._at.localeCompare(a._at));
		const strip = (r: Row): INodeExecutionData => {
			const json: IDataObject = { id: r._id, ...r };
			delete json._id;
			delete json._at;
			return { json };
		};

		// Manual "Fetch Test Event": show the newest item without touching the saved state.
		if (this.getMode() === 'manual') {
			return rows.length ? [rows.slice(0, 1).map(strip)] : null;
		}

		const state = this.getWorkflowStaticData('node') as { seen?: string[] };
		const seen = new Set(state.seen || []);
		const firstRun = !state.seen;
		const fresh = rows.filter((r) => !seen.has(r._id));
		state.seen = [...rows.map((r) => r._id), ...(state.seen || [])]
			.filter((id, idx, arr) => arr.indexOf(id) === idx)
			.slice(0, MAX_SEEN);

		if (firstRun || !fresh.length) return null;
		return [fresh.reverse().map(strip)];
	}
}
