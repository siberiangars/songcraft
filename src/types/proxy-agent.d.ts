declare module "proxy-agent" {
  import type { Agent } from "http";
  export class ProxyAgent extends Agent {
    constructor(opts?: Record<string, unknown>);
  }
  export default ProxyAgent;
}
