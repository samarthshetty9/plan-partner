/**
 * Netlify serverless function: proxies API requests to your HTTP backend.
 * Fixes Mixed Content (HTTPS page calling HTTP API) by making the call server-side.
 *
 * Frontend should use VITE_API_URL=/.netlify/functions/api on Netlify.
 * Set BACKEND_URL in Netlify env (e.g. http://13.233.110.45:3001).
 */

const FUNCTION_PATH = "/.netlify/functions/api";

exports.handler = async (event) => {
  const backendUrl = process.env.BACKEND_URL || "http://13.233.110.45:3001";
  const base = backendUrl.replace(/\/$/, "");

  // Path: from rewrite ?path=:splat (e.g. path=auth/register), or from event.path when called directly
  const pathParam = event.queryStringParameters && event.queryStringParameters.path;
  const pathFromQuery = pathParam ? (pathParam.startsWith("/") ? pathParam : `/${pathParam}`) : null;
  const pathFromEvent = event.path.startsWith(FUNCTION_PATH)
    ? event.path.slice(FUNCTION_PATH.length) || "/"
    : event.path.startsWith("/api")
    ? event.path.slice(4) || "/"
    : event.path;
  const apiPath = pathFromQuery || pathFromEvent;
  const finalPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  // Rebuild query without "path" so we don't forward it to the backend
  const q = event.queryStringParameters ? { ...event.queryStringParameters } : {};
  delete q.path;
  const query = Object.keys(q).length ? "?" + new URLSearchParams(q).toString() : "";
  const url = `${base}/api${finalPath}${query}`;

  const headers = { "Content-Type": "application/json" };
  const authHeader = event.headers.authorization || event.headers.Authorization || event.headers["x-authorization"] || event.headers["X-Authorization"];
  if (authHeader) headers["Authorization"] = authHeader;
  const contentTypeHeader = event.headers["content-type"] || event.headers["Content-Type"];
  if (contentTypeHeader) headers["Content-Type"] = contentTypeHeader;

  // Netlify may send body base64-encoded (e.g. multipart/form-data); decode so backend receives raw body
  let body = event.body;
  if (body && (event.httpMethod === "POST" || event.httpMethod === "PATCH" || event.httpMethod === "PUT")) {
    if (event.isBase64Encoded) {
      body = Buffer.from(event.body, "base64");
    }
  } else {
    body = undefined;
  }

  const options = {
    method: event.httpMethod,
    headers,
    body,
  };

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "application/json";

    // If backend returns Express 404, surface a hint (backend may be down or BACKEND_URL wrong)
    if (res.status === 404 && text.includes("Cannot POST") && text.includes("<pre>")) {
      console.error("Backend 404 for:", url, "Check BACKEND_URL and that the API server is running.");
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({
          error: "Backend returned 404",
          message: "The API server did not recognize this route. Ensure BACKEND_URL is correct (e.g. http://YOUR_IP:3001 with no trailing slash) and the plan-partner API is running (e.g. pm2 list).",
          proxyTarget: url,
        }),
      };
    }

    return {
      statusCode: res.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
      body: text,
    };
  } catch (err) {
    console.error("Proxy error:", err.message, "url:", url);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Bad Gateway",
        message: err.message,
        hint: "Is BACKEND_URL reachable from Netlify? Check the API server is running and MongoDB is connected.",
      }),
    };
  }
};
