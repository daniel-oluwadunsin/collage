import { spawn } from "node:child_process";
import process from "node:process";

const workspace = "/workspace";
const children = new Map();
let shuttingDown = false;

const environmentWithoutGroq = () => {
  const environment = { ...process.env };
  delete environment.GROQ_API_KEY;
  delete environment.GROQ_MODEL;
  delete environment.GROQ_TIMEOUT_MS;
  delete environment.GROQ_REASONING_EFFORT;
  delete environment.GROQ_MAX_TOOL_CALLS;
  delete environment.ASSISTANT_ENABLED;
  delete environment.ASSISTANT_MAX_MESSAGE_LENGTH;
  delete environment.ASSISTANT_USER_RATE_LIMIT_PER_MINUTE;
  delete environment.ASSISTANT_CHAT_RATE_LIMIT_PER_MINUTE;
  return environment;
};

const runMigration = () =>
  new Promise((resolve, reject) => {
    const migration = spawn(
      "node",
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      {
        cwd: `${workspace}/packages/database`,
        env: environmentWithoutGroq(),
        stdio: "inherit",
      },
    );
    migration.once("error", reject);
    migration.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Database migration failed (${signal ?? `exit code ${code}`})`,
          ),
        );
    });
  });

const services = [
  {
    name: "api",
    command: "node",
    args: ["apps/api/dist/index.js"],
    env: { API_PORT: "4000" },
    receivesGroqConfiguration: true,
  },
  {
    name: "bot",
    command: "node",
    args: ["apps/bot/dist/index.js"],
    env: { BOT_PORT: "4001" },
  },
  {
    name: "worker",
    command: "node",
    args: ["apps/worker/dist/index.js"],
    env: { WORKER_HEALTH_PORT: "4002" },
  },
  {
    name: "mini-app",
    command: "node",
    args: ["apps/mini-app/server.js"],
    cwd: `${workspace}/apps/mini-app/.next/standalone`,
    env: { HOSTNAME: "0.0.0.0", PORT: "3000" },
  },
  {
    name: "gateway",
    command: "node",
    args: ["docker/render/gateway.mjs"],
  },
];

const terminateChildren = (signal = "SIGTERM") => {
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
};

const shutdown = (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  console.log(
    JSON.stringify({
      level: "info",
      message: "Render demo supervisor shutting down",
      signal,
    }),
  );
  terminateChildren("SIGTERM");
  const forceTimer = setTimeout(() => terminateChildren("SIGKILL"), 25_000);
  forceTimer.unref();
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

try {
  await runMigration();

  for (const service of services) {
    const child = spawn(service.command, service.args, {
      cwd: service.cwd ?? workspace,
      env: {
        ...(service.receivesGroqConfiguration
          ? process.env
          : environmentWithoutGroq()),
        ...service.env,
      },
      stdio: "inherit",
    });
    children.set(service.name, child);
    child.once("error", (error) => {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Render demo process failed to start",
          service: service.name,
          error: error.message,
        }),
      );
      shutdown(`start-error:${service.name}`, 1);
    });
    child.once("exit", (code, signal) => {
      children.delete(service.name);
      if (!shuttingDown) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Critical Render demo process exited",
            service: service.name,
            code,
            signal,
          }),
        );
        shutdown(`child-exit:${service.name}`, 1);
      }
      if (children.size === 0) process.exit();
    });
  }
} catch (error) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Render demo startup failed",
      error: error instanceof Error ? error.message : "Unknown startup error",
    }),
  );
  process.exitCode = 1;
}
