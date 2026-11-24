# n8n-nodes-firsttouch

n8n community nodes for [FirstTouch](https://www.firsttouch.com): human-paced LinkedIn outreach for HubSpot teams.

## Nodes

**FirstTouch Trigger** (polling)
- Connection Accepted: someone became a new LinkedIn connection of a teammate
- New LinkedIn Reply: a prospect replied in the FirstTouch inbox
- New Social Engager: someone reacted to or commented on a profile or page monitored by a FirstTouch signal

On activation the trigger records the events that already exist, so a new workflow does not replay history. After that, each event fires once.

**FirstTouch** (actions, also usable as an AI agent tool)
- Check Connection Status
- Send Connection Request, Send Message, Send InMail, View Profile. Human approval is on by default, so each step waits in FirstTouch Tasks until someone approves it.
- Enroll Contact Into Flow

## Credentials

In FirstTouch, go to **Settings > MCP & API** and create an API key. In n8n, create a **FirstTouch API** credential and paste the key.

## Development

```
npm install
npm run dev      # local n8n at http://localhost:5678 with these nodes loaded
npm test         # build + offline trigger tests
npm run lint
```

## License

MIT
