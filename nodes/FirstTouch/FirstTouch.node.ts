import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	callTool,
	getFlowPlans,
	getLinkedinAccounts,
	getSignals,
	getTeamMembers,
	personProfileUrl,
} from './GenericFunctions';

// Actions mirror the FirstTouch HubSpot workflow cards (and the Zapier and Make apps):
// Check connection status, Send connection request, Send message, Send InMail, View profile,
// Enroll contact into a FirstTouch flow.

const LINKEDIN_OPS = ['sendConnectionRequest', 'sendMessage', 'sendInmail', 'viewProfile'];
const show = (operation: string[]) => ({ show: { operation } });

const properties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		default: 'checkConnectionStatus',
		options: [
			{
				name: 'Check Connection Status',
				value: 'checkConnectionStatus',
				description: 'Check whether a teammate is connected to the contact on LinkedIn',
				action: 'Check connection status',
			},
			{
				name: 'Enroll Contact Into Flow',
				value: 'enrollInFlow',
				description: 'Add a contact to a FirstTouch flow',
				action: 'Enroll contact into flow',
			},
			{
				name: 'Send Connection Request',
				value: 'sendConnectionRequest',
				description: 'Send a LinkedIn connection request, with an optional note',
				action: 'Send connection request',
			},
			{
				name: 'Send InMail',
				value: 'sendInmail',
				description: 'Send a LinkedIn InMail (sender needs Premium or Sales Navigator)',
				action: 'Send in mail',
			},
			{
				name: 'Send Message',
				value: 'sendMessage',
				description: 'Send a LinkedIn message to someone the sender is connected to',
				action: 'Send message',
			},
			{
				name: 'View Profile',
				value: 'viewProfile',
				description: "Visit the contact's LinkedIn profile from the sender's account",
				action: 'View profile',
			},
		],
	},
	{
		displayName: 'LinkedIn Profile URL',
		name: 'linkedinUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://www.linkedin.com/in/jane-doe',
		description: "The contact's LinkedIn profile URL",
		displayOptions: show(['checkConnectionStatus', ...LINKEDIN_OPS]),
	},
	{
		displayName: 'Teammate Name or ID',
		name: 'ownerUserId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTeamMembers' },
		default: '',
		description:
			'Only check this teammate. Leave blank to check everyone on your team. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show(['checkConnectionStatus']),
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: show(LINKEDIN_OPS),
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: show(LINKEDIN_OPS),
	},
	{
		displayName: 'Send From Name or ID',
		name: 'assignedUserId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTeamMembers' },
		default: '',
		description:
			'The teammate whose LinkedIn account sends. Leave blank for the owner of the API key. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: show(LINKEDIN_OPS),
	},
	{
		displayName: 'Message',
		name: 'message',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: show(['sendMessage']),
	},
	{
		displayName: 'Note',
		name: 'note',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Optional connection note, up to about 300 characters',
		displayOptions: show(['sendConnectionRequest']),
	},
	{
		displayName: 'Subject',
		name: 'subject',
		type: 'string',
		default: '',
		required: true,
		displayOptions: show(['sendInmail']),
	},
	{
		displayName: 'InMail Body',
		name: 'inmailBody',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: show(['sendInmail']),
	},
	{
		displayName: 'Require Approval',
		name: 'isHumanApprovalRequired',
		type: 'boolean',
		default: true,
		description: 'Whether the step waits in FirstTouch Tasks until someone approves it',
		displayOptions: show(LINKEDIN_OPS),
	},
	{
		displayName: 'Flow Name or ID',
		name: 'flowPlanId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getFlowPlans' },
		default: '',
		required: true,
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: show(['enrollInFlow']),
	},
	{
		displayName: 'Contact',
		name: 'contact',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		description: 'Provide an email, a LinkedIn URL, or first name + last name + company domain',
		displayOptions: show(['enrollInFlow']),
		options: [
			{ displayName: 'Company Domain', name: 'companyDomain', type: 'string', default: '', placeholder: 'acme.com' },
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
			{ displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
			{ displayName: 'Last Name', name: 'lastName', type: 'string', default: '' },
			{ displayName: 'LinkedIn Profile URL', name: 'linkedinUrl', type: 'string', default: '' },
			{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['enrollInFlow']),
		options: [
			{
				displayName: 'Custom Variables',
				name: 'customVariables',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				options: [
					{
						displayName: 'Variable',
						name: 'variable',
						values: [
							{ displayName: 'Name', name: 'key', type: 'string', default: '' },
							{ displayName: 'Value', name: 'value', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Enrollment Mode',
				name: 'enrollmentMode',
				type: 'options',
				default: 'manual',
				options: [
					{ name: 'Add to Awaiting Only', value: 'manual' },
					{ name: 'Start Now (Flow Must Be Published)', value: 'enroll' },
				],
				description: "Leave this option out to use the flow's own setting",
			},
			{
				displayName: 'Skip Exclusion Check',
				name: 'ignoreExclusionCheck',
				type: 'boolean',
				default: false,
				description: 'Whether to enroll even if the contact matches an exclusion',
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(LINKEDIN_OPS),
		options: [
			{ displayName: 'Company Domain', name: 'companyDomain', type: 'string', default: '', placeholder: 'acme.com' },
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
			{
				displayName: 'Reason / Context',
				name: 'sourceDescription',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Shown to the approver: why this contact, where they came from',
			},
		],
	},
];

const ACTION_TYPES: Record<string, string> = {
	sendConnectionRequest: 'linkedin_connect',
	sendMessage: 'linkedin_message',
	sendInmail: 'linkedin_inmail',
	viewProfile: 'linkedin_profile_view',
};
const LABELS: Record<string, string> = {
	sendConnectionRequest: 'Send Connection Request',
	sendMessage: 'Send Message',
	sendInmail: 'Send InMail',
	viewProfile: 'View Profile',
};

export class FirstTouch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FirstTouch',
		name: 'firstTouch',
		icon: { light: 'file:firsttouch.svg', dark: 'file:firsttouch.dark.svg' },
		group: ['output'],
		version: [1],
		subtitle: '={{$parameter["operation"]}}',
		description: 'LinkedIn outreach with human approval: connection checks, messages, InMails, connection requests and flows',
		defaults: { name: 'FirstTouch' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'firstTouchApi', required: true }],
		properties,
	};

	methods = { loadOptions: { getFlowPlans, getTeamMembers, getLinkedinAccounts, getSignals } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let json: IDataObject;

				if (operation === 'checkConnectionStatus') {
					const linkedinUrl = personProfileUrl.call(this, this.getNodeParameter('linkedinUrl', i), i);
					const ownerUserId = this.getNodeParameter('ownerUserId', i, '') as string;
					const res = await callTool.call(this, 'list_linkedin_team_connections', {
						mode: 'team_members_connected_to_person',
						connectedPersonLinkedInUrl: linkedinUrl,
						ownerUserId,
						limit: 100,
					});
					const rows = (((res.connections as IDataObject) || {}).items as IDataObject[]) || [];
					const owner = (r: IDataObject) => (r.owner as IDataObject) || {};
					const conn = (r: IDataObject) => (r.connection as IDataObject) || {};
					const first = rows[0];
					json = {
						linkedinUrl,
						isConnected: rows.length > 0,
						connectedTeammateCount: rows.length,
						connectedTeammates: rows.map((r) => owner(r).name).filter(Boolean).join(', '),
						connectedTeammateEmails: rows.map((r) => owner(r).email).filter(Boolean).join(', '),
						firstConnectedTeammateUserId: first ? owner(first).userId : null,
						connectedAtUtc: first ? conn(first).connectedAtUtc : null,
						fullName: first ? conn(first).fullName : null,
						headline: first ? conn(first).headline : null,
					};
				} else if (LINKEDIN_OPS.includes(operation)) {
					const linkedinUrl = personProfileUrl.call(this, this.getNodeParameter('linkedinUrl', i), i);
					const firstName = String(this.getNodeParameter('firstName', i) || '').trim();
					const lastName = String(this.getNodeParameter('lastName', i) || '').trim();
					if (!firstName || !lastName) {
						throw new NodeOperationError(
							this.getNode(),
							"FirstTouch needs the contact's First Name and Last Name to start this step.",
							{ itemIndex: i },
						);
					}
					const extra = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
					const action: IDataObject = {
						type: ACTION_TYPES[operation],
						assignedUserId: this.getNodeParameter('assignedUserId', i, '') as string,
						isHumanApprovalRequired: this.getNodeParameter('isHumanApprovalRequired', i, true) as boolean,
					};
					if (operation === 'sendMessage') action.message = this.getNodeParameter('message', i);
					if (operation === 'sendConnectionRequest') action.message = this.getNodeParameter('note', i, '');
					if (operation === 'sendInmail') {
						action.subject = this.getNodeParameter('subject', i);
						action.prompt = this.getNodeParameter('inmailBody', i);
					}
					try {
						json = await callTool.call(this, 'create_contact_sequence', {
							action,
							contact: { firstName, lastName, email: extra.email, linkedInUrl: linkedinUrl },
							company: { domain: extra.companyDomain },
							sourceDescription: (extra.sourceDescription as string) || `${LABELS[operation]} from n8n`,
						});
					} catch (err) {
						// Same policy as the HubSpot card: an already-connected contact fails the step with a
						// plain-language notice instead of the API's agent-facing wording.
						// n8n keeps the API's text in message, description or the wrapped cause depending on version.
						const e = err as Error & { description?: unknown; cause?: unknown; context?: unknown };
						let msg = `${e.message || ''} ${e.description || ''}`;
						try {
							msg += ` ${JSON.stringify(e.cause ?? '')} ${JSON.stringify(e.context ?? '')}`;
						} catch {
							// circular structures: the message/description are enough
						}
						if (operation === 'sendConnectionRequest' && /already connected/i.test(msg)) {
							const who = (msg.match(/sender '([^']+)'/) || [])[1] || 'The sender';
							throw new NodeOperationError(
								this.getNode(),
								`${who} is already connected to this contact on LinkedIn, so no request was sent. Add a Check Connection Status step with an If node to message existing connections instead.`,
								{ itemIndex: i },
							);
						}
						throw new NodeOperationError(this.getNode(), err as Error, { itemIndex: i });
					}
				} else if (operation === 'enrollInFlow') {
					const flowPlanId = this.getNodeParameter('flowPlanId', i) as string;
					const c = this.getNodeParameter('contact', i, {}) as IDataObject;
					const o = this.getNodeParameter('options', i, {}) as IDataObject;
					if (!c.email && !c.linkedinUrl && !(c.firstName && c.lastName && c.companyDomain)) {
						throw new NodeOperationError(
							this.getNode(),
							'Provide an email, a LinkedIn URL, or first name + last name + company domain.',
							{ itemIndex: i },
						);
					}
					// The schema requires prospect and company objects with every key present (nullable).
					const v = (x: unknown) => (x === undefined || x === null || String(x).trim() === '' ? null : String(x).trim());
					const manualEnrollment: IDataObject = {
						prospect: {
							firstName: v(c.firstName),
							lastName: v(c.lastName),
							email: v(c.email),
							linkedinUrl: v(c.linkedinUrl),
							phone: v(c.phone),
						},
						company: { domain: v(c.companyDomain), linkedinUrl: null, linkedinId: null },
						options: { ignoreExclusionCheck: Boolean(o.ignoreExclusionCheck) },
					};
					const vars = (((o.customVariables as IDataObject) || {}).variable as IDataObject[]) || [];
					if (vars.length) {
						manualEnrollment.customVariables = Object.fromEntries(
							vars.filter((x) => x.key).map((x) => [x.key as string, x.value as string]),
						);
					}
					const body: IDataObject = { flowPlanId, manualEnrollment, includeWorkspaceRefresh: false };
					if (o.enrollmentMode) body.enrollmentMode = o.enrollmentMode;
					json = await callTool.call(this, 'add_manual_flow_enrollment', body, { raw: true });
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
				}

				returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
