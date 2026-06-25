/**
 * Serverless proxy for ClickUp API.
 * Keeps CLICKUP_API_KEY server-side — never exposed to the browser.
 *
 * Usage: GET /api/clickup?path=/v2/view/ID/task&page=0
 *        GET /api/clickup?path=/v2/task/TASK_ID
 */
export default async function handler(req, res) {
  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CLICKUP_API_KEY environment variable is not set.' });
  }

  const { path: apiPath, ...queryParams } = req.query;
  if (!apiPath) {
    return res.status(400).json({ error: 'path query param is required, e.g. ?path=/v2/view/ID/task' });
  }

  // Build upstream URL
  const qs = new URLSearchParams(queryParams).toString();
  const upstreamUrl = `https://api.clickup.com/api${apiPath}${qs ? '?' + qs : ''}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method || 'GET',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: req.method && req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await upstream.json();

    // Short cache: 60s fresh, serve stale up to 5min while revalidating
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ClickUp API', detail: err.message });
  }
}
