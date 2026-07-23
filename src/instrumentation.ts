export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Must configure proxy FIRST so all subsequent fetch() calls use it
    const { configureProxy } = await import("@/lib/songcraft/proxy");
    await configureProxy();

    // Warm up bot instance in background
    const { warmupBot } = await import("@/lib/songcraft/bot");
    warmupBot();
  }
}
