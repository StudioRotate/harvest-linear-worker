interface HarvestTimeEntry {
  id: number;
  hours: number;
  notes: string;
  updated_at: string;
  user: {
    name: string;
  };
  external_reference: {
    id: string;
    service: string;
    group_id?: string;
  };
}

interface LinearGetIssueEstimateApiResponse {
  data: {
    issue: {
      estimate: number;
      labels: {
        nodes: {
          id: string;
        }[];
      };
    };
  };
  errors?: Array<{ message: string }>;
}

interface LinearUpdateIssueApiResponse {
  data: {
    commentCreate?: {
      success: boolean;
    };
    issueUpdate?: {
      success: boolean;
    };
  };
  errors?: Array<{ message: string }>;
}

interface HarvestApiResponse {
  time_entries: HarvestTimeEntry[];
}

const LINEAR_API_URL = "https://api.linear.app/graphql";
const KV_ENTRY_NAMESPACE = "harvest_last_entry_id";
const KV_ISSUE_NAMESPACE = "linear_issue_tracked_time";
const WORKSPACE_LABEL_IDS = {
  OVER: "9a35399f-0bfe-49a0-b10a-0176600422d4",
  UNDER: "e087901d-c0b4-4aa8-964c-2b3d99e3541f",
  ON_TRACK: "8a15c5b7-9853-4286-b346-d86e1b3d448d",
};

async function fetchTimeEntriesFromHarvest(
  lastProcessedTimestamp: string,
  env: Env
): Promise<HarvestTimeEntry[]> {
  const response = await fetch(
    `https://api.harvestapp.com/v2/time_entries?updated_since=${lastProcessedTimestamp}`,
    {
      headers: {
        Authorization: `Bearer ${env.HARVEST_API_KEY}`,
        "Harvest-Account-Id": env.HARVEST_ACCOUNT_ID,
        "User-Agent": "Harvest API Example",
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch time entries from Harvest");
  }

  const data: HarvestApiResponse = await response.json();

  return data?.time_entries as HarvestTimeEntry[];
}

async function getIssueTrackedTime(issueId: string, env: Env): Promise<number> {
  const trackedTime = await env[KV_ISSUE_NAMESPACE].get(issueId);
  if (trackedTime) {
    return parseFloat(trackedTime);
  }

  return 0;
}

async function setIssueTrackedTime(
  timeValue: number,
  issueId: string,
  env: Env
): Promise<void> {
  await env[KV_ISSUE_NAMESPACE].put(issueId, timeValue);
}

async function getLastProcessedDate(env: Env): Promise<string> {
  const lastTimestamp = await env[KV_ENTRY_NAMESPACE].get(
    "lastProcessedTimestamp"
  );
  if (lastTimestamp) {
    return lastTimestamp;
  }

  const now = new Date().toISOString();
  await setLastProcessedDate(now, env);
  return now;
}

async function setLastProcessedDate(
  latestTimestamp: string,
  env: Env
): Promise<void> {
  await env[KV_ENTRY_NAMESPACE].put("lastProcessedTimestamp", latestTimestamp);
}

async function getLinearIssue(
  issueId: string,
  env: Env
): Promise<LinearGetIssueEstimateApiResponse | null> {
  const query = `
		query {
			issue(id: "${issueId}") {
				estimate
				labels {
                    nodes {
                        id
                    }
                }
			}
		}
	`;

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Linear issue estimate");
  }

  const data: LinearGetIssueEstimateApiResponse = await response.json();

  if (data?.errors?.length) {
    console.log(data.errors[0].message, "Error fetching Linear issue estimate");
    return null;
  }

  return data || null;
}

async function modifyLinearIssue(
  issueId: string,
  comment: string,
  labelIds: string[],
  env: Env
): Promise<void> {
  const query = `
		mutation IssueUpdate {
			commentCreate(input: {issueId: "${issueId}", body: "${comment}"}) {
				success
			}
			issueUpdate(id: "${issueId}", input: {labelIds: ${JSON.stringify(labelIds)} }) {
				success
			}
		}
	`;

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  const data: LinearUpdateIssueApiResponse = await response.json();

  if (data?.errors?.length) {
    console.log(data.errors[0].message, "Error updating Linear issue");
    return Promise.reject(data.errors[0].message);
  }

  const commentSuccess = data.data.commentCreate?.success;
  const labelSuccess = data.data.issueUpdate?.success;

  if (!commentSuccess || !labelSuccess) {
    throw new Error("Failed to update Linear issue.");
  }
}

async function processTimeEntries(env: Env): Promise<Response> {
  const lastProcessedTimestamp = await getLastProcessedDate(env);
  const timeEntries = await fetchTimeEntriesFromHarvest(
    lastProcessedTimestamp,
    env
  );

  const newEntries = timeEntries?.filter(
    (entry) => entry.external_reference?.service === "linear.app"
  );

  if (newEntries.length === 0) {
    return new Response("No new time entries to process.", { status: 200 });
  }

  for (const entry of newEntries) {
    const linearIssueId = entry.external_reference?.id;

    if (!linearIssueId || !linearIssueId.includes("WIL")) continue;

    const linearIssue = await getLinearIssue(linearIssueId, env);
    const estimate = linearIssue?.data?.issue.estimate || null;
    const existingLabels =
      linearIssue?.data?.issue.labels.nodes.map((label) => label.id) || [];
    if (!estimate) continue;

    let labelIds = new Set([...existingLabels]);
    let comparisonResult = "";

    const issueTrackedTime = await getIssueTrackedTime(linearIssueId, env);
    const trackedTime = parseFloat((issueTrackedTime + entry.hours).toFixed(2));

    if (trackedTime > estimate) {
      labelIds.add(WORKSPACE_LABEL_IDS["OVER"]);
      comparisonResult = `🔴 **Over**: ${trackedTime} hours tracked, which is ${(
        Math.round((trackedTime - estimate) * 100) / 100
      ).toFixed(2)} hours over the estimate of ${estimate} hours.`;
    } else if (trackedTime < estimate) {
      labelIds.add(WORKSPACE_LABEL_IDS["UNDER"]);
      comparisonResult = `🟢 **Under**: ${trackedTime} hours tracked, which is ${(
        Math.round((estimate - trackedTime) * 100) / 100
      ).toFixed(2)} hours under the estimate of ${estimate} hours.`;
    } else {
      labelIds.add(WORKSPACE_LABEL_IDS["ON_TRACK"]);
      comparisonResult = `🟡 **On Track**: ${trackedTime} hours tracked, which matches the estimate of ${estimate} hours exactly.`;
    }

    const comment =
      `🕒 **Time Tracked** by ${entry.user.name}: ${comparisonResult} 📝 **Notes**: ${entry.notes}`.trim();

    await modifyLinearIssue(linearIssueId, comment, [...labelIds], env);
    await setIssueTrackedTime(trackedTime, linearIssueId, env);
  }

  const latestEntryTimestamp = timeEntries
    .map((entry) => new Date(entry.updated_at).toISOString())
    .reduce(
      (latest, current) => (current > latest ? current : latest),
      lastProcessedTimestamp
    );

  await setLastProcessedDate(latestEntryTimestamp, env);

  return new Response("Time entries processed successfully.", { status: 200 });
}

export default {
  async fetch(request: Request): Promise<Response> {
    return new Response("This worker does not handle direct requests.");
  },

  async scheduled(controller: ScheduledController, env: Env) {
    try {
      await processTimeEntries(env);
    } catch (err) {
      console.error("Error processing time entries:", err);
    }
  },
} satisfies ExportedHandler<Env>;
