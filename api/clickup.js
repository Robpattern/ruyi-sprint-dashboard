/**
 * Serverless proxy for ClickUp API.
 * Keeps CLICKUP_API_KEY server-side — never exposed to the browser.
 *
 * Usage: GET /api/clickup?path=/v2/view/ID/task&page=0
 *        GET /api/clickup?path=/v2/task/TASK_ID
 */
module.exports = async function handler(req, res) {
  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CLICKUP_API_KEY environment variable is not set.' });
  }

  // SECURITY: this endpoint is public and unauthenticated — anyone who finds the
  // URL can call it directly (not just the dashboard's own frontend). It forwards
  // requests to ClickUp using a privileged, full-access API key, so we lock it
  // down to read-only, well-formed ClickUp v2 paths only. The dashboard itself
  // never issues anything but GET — if that changes, extend this allowlist
  // deliberately rather than opening it back up.
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET is allowed on this proxy.' });
  }

  const { path: apiPath, ...queryParams } = req.query;
  if (!apiPath) {
    return res.status(400).json({ error: 'path query param is required, e.g. ?path=/v2/view/ID/task' });
  }
  if (!/^\/v2\/[a-zA-Z0-9/_-]+$/.test(apiPath)) {
    return res.status(400).json({ error: 'path must be a plain ClickUp v2 API path, e.g. /v2/list/123/task' });
  }

  // Build upstream URL
  const qs = new URLSearchParams(queryParams).toString();
  const upstreamUrl = `https://api.clickup.com/api${apiPath}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await upstream.json();

    // Short cache: 60s fresh, serve stale up to 5min while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ClickUp API', detail: err.message });
  }
}
