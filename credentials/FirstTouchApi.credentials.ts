import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FirstTouchApi implements ICredentialType {
	name = 'firstTouchApi';

	displayName = 'FirstTouch API';

	icon: Icon = { light: 'file:../nodes/FirstTouch/firsttouch.svg', dark: 'file:../nodes/FirstTouch/firsttouch.dark.svg' };

	documentationUrl = 'https://github.com/First-Touch-Inc/n8n-nodes-firsttouch#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'In FirstTouch, go to Settings > MCP & API and create an API key',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://gateway.firsttouch.ai/api/public/tools',
			url: '/get_current_user',
			method: 'POST',
			body: {},
			json: true,
		},
	};
}
