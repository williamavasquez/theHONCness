// Migration file for WaitingRoom Durable Object
export default {
  async scheduled(controller, env, ctx) {
    // Migration for creating WaitingRoom Durable Object
  },
  async fetch(request, env) {
    return new Response("Migration complete");
  },
};
