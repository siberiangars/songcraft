// Configure global fetch() to route through the system proxy (127.0.0.1:12334)
// This is needed because Node.js native fetch ignores HTTP_PROXY env var.
// Must be imported before any grammy/fetch usage.

let configured = false;

export async function configureProxy() {
  if (configured) return;
  configured = true;

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return;

  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
    console.log(`[proxy] Global fetch configured → ${proxyUrl}`);
  } catch (e) {
    console.error("[proxy] Failed to configure proxy:", e);
  }
}
