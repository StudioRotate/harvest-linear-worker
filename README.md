# Harvest Linear Sync Worker

This Cloudflare Worker automatically syncs time entries from Harvest with Linear issues, posting comments and applying labels based on how tracked time compares to estimates. It uses Cloudflare KV to store the date of the last processed entry and Cloudflare Cron Triggers to periodically run the sync.

## Features

- **Time Tracking Sync:** Automatically syncs time entries from Harvest to Linear.
- **Cursor-based Syncing:** Uses the date of the last processed entry as a cursor to fetch only new or updated time entries.
- **Estimate Comparison:** Compares tracked time against Linear Fibonacci estimates (1, 2, 3, 5, 8, 13, 21 hours).
- **Automatic Labeling:** Adds labels to Linear issues (Over, Under, On Track) based on tracked time without removing existing labels.
  Customizable Comments: Posts detailed comments in Linear with emojis and clear formatting.
- **KV Storage:** Uses Cloudflare KV to store the last processed entry date to avoid re-processing entries.
- **Cron Triggers:** Runs every minute to ensure timely synchronization.

## Requirements

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Harvest API Key](https://help.getharvest.com/api-v2/authentication-api/authentication/authentication/)
- [Linear API Key](https://developers.linear.app/docs/graphql/working-with-the-graphql-api#authentication)

## Setup

1. Clone the Repository
   ```
   git clone ...
   cd harvest-linear-worker
   ```
2. Install Dependencies
   Install the necessary dependencies using npm (v20.14.0):
   ```
   npm install
   ```
3. Configure wrangler.toml
   Create and configure your wrangler.toml file based on the `wrangler.example.toml` provided.

### KV Namespace Configuration

```
[[kv_namespaces]]
binding = "HARVEST_LAST_ENTRY_ID"
id = "your-kv-namespace-id"
```

#### Create the KV namespace in Cloudflare:

```
wrangler kv:namespace create "HARVEST_LAST_ENTRY_ID"
```

Add the generated KV namespace ID to the wrangler.toml file.

### Schedule Configuration

```
[[triggers]]
crons = ["* * * * *"] # Every minute cron schedule
```

### Environment Variables

```
[env]
HARVEST_API_KEY = "your-harvest-api-key"
HARVEST_ACCOUNT_ID = "your-harvest-account-id"
LINEAR_API_KEY = "your-linear-api-key"
```

## Deploying your worker

Deploy your Cloudflare Worker using Wrangler:

```
wrangler publish
```

## How It Works

### Workflow

- **Cron Trigger:** The Worker is triggered every minute by a Cloudflare Cron Trigger.
- **Fetch Time Entries:** It fetches recent time entries from Harvest starting from the last processed date stored in KV.
  KV Check: The Worker checks Cloudflare KV for the last processed entry date to ensure only new or updated entries are handled.
- **Estimate Comparison:** The Worker compares the tracked hours with the Fibonacci estimate on the corresponding Linear issue.
  Comment and Label: The Worker posts a comment to the Linear issue, adds a label (Over, Under, On Track), and updates the KV store with the latest processed date.

### Comment Example

A comment might look like this:

```
🕒 **Time Tracked** by John Doe:
🔴 **Over**: 10 hours tracked, which is 2 hours over the estimate of 8 hours.
📝 **Notes**: Refactoring the API for better performance.
```

### Cron Schedule

The Worker runs every minute by default, but you can adjust this in the wrangler.toml file.

### Development

To test the Worker locally, use the wrangler dev command:

```
wrangler dev
```

This will run the Worker on a local development server, allowing you to test and debug before deploying.

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request. Please ensure that your code follows the existing style and includes appropriate tests.
