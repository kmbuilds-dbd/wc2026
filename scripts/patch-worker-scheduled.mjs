import { readFileSync, writeFileSync } from "node:fs";

const workerPath = ".open-next/worker.js";
const marker = "async scheduled(controller, env, ctx)";
const source = readFileSync(workerPath, "utf8");

if (source.includes(marker)) {
  process.exit(0);
}

const cronHandler = `    async scheduled(controller, env, ctx) {
        const targets = {
            "*/30 * * * *": "/api/cron/ingest-matches",
            "0 6 * * *": "/api/cron/refresh-odds",
            "0 9 * * *": "/api/admin/refresh-squads",
        };
        const path = targets[controller.cron];
        if (!path) {
            console.warn(\`No scheduled target configured for cron: \${controller.cron}\`);
            return;
        }
        const secret = env.CRON_SECRET;
        if (!secret) {
            throw new Error("CRON_SECRET is required for scheduled refresh jobs.");
        }
        const request = new Request(\`https://wc2026.followbuilders.workers.dev\${path}\`, {
            method: "POST",
            headers: { "x-cron-secret": secret },
        });
        const response = await env.WORKER_SELF_REFERENCE.fetch(request);
        if (!response.ok) {
            const body = await response.text();
            throw new Error(\`Scheduled \${path} failed: \${response.status} \${body.slice(0, 500)}\`);
        }
    },
`;

const patched = source.replace("};\n", `${cronHandler}};\n`);
if (patched === source) {
  throw new Error(`Could not patch ${workerPath}: export object terminator not found.`);
}

writeFileSync(workerPath, patched);
