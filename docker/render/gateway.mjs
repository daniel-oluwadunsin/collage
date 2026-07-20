import http from "node:http";

const publicPort = Number.parseInt(process.env.PORT ?? "10000", 10);

if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}

const targets = {
  api: { hostname: "127.0.0.1", port: 4000 },
  bot: { hostname: "127.0.0.1", port: 4001 },
  miniApp: { hostname: "127.0.0.1", port: 3000 },
  worker: { hostname: "127.0.0.1", port: 4002 },
};

const readinessChecks = [
  ["api", "/health/ready"],
  ["bot", "/health/ready"],
  ["worker", "/health/ready"],
  ["miniApp", "/health/ready"],
];

const checkReadiness = async () => {
  const results = await Promise.allSettled(
    readinessChecks.map(async ([name, path]) => {
      const target = targets[name];
      const response = await fetch(
        `http://${target.hostname}:${target.port}${path}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!response.ok) {
        throw new Error(`${name} readiness returned ${response.status}`);
      }
      return name;
    }),
  );
  return results.every((result) => result.status === "fulfilled");
};

const routeRequest = (pathname) => {
  if (pathname === "/telegram/webhook") {
    return { target: targets.bot, pathname };
  }
  if (pathname.startsWith("/bot/health/")) {
    return {
      target: targets.bot,
      pathname: pathname.slice("/bot".length),
    };
  }
  if (pathname.startsWith("/worker/health/")) {
    return {
      target: targets.worker,
      pathname: pathname.slice("/worker".length),
    };
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return {
      target: targets.api,
      pathname: pathname.slice("/api".length) || "/",
    };
  }
  return { target: targets.miniApp, pathname };
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://render.internal");

  if (requestUrl.pathname === "/health/live") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", service: "render" }));
    return;
  }

  if (requestUrl.pathname === "/health/ready") {
    const ready = await checkReadiness().catch(() => false);
    response.writeHead(ready ? 200 : 503, {
      "cache-control": "no-store",
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        status: ready ? "ready" : "not_ready",
        service: "render",
      }),
    );
    return;
  }

  const route = routeRequest(requestUrl.pathname);
  const forwardedPath = `${route.pathname}${requestUrl.search}`;
  const forwardedHeaders = {
    ...request.headers,
    host: `${route.target.hostname}:${route.target.port}`,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": "https",
  };

  const proxyRequest = http.request(
    {
      hostname: route.target.hostname,
      port: route.target.port,
      method: request.method,
      path: forwardedPath,
      headers: forwardedHeaders,
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode ?? 502,
        proxyResponse.statusMessage,
        proxyResponse.headers,
      );
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(502, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
    }
    response.end(
      JSON.stringify({
        status: "unavailable",
        message: "The requested Collage service is starting or unavailable.",
      }),
    );
  });

  request.on("aborted", () => proxyRequest.destroy());
  request.pipe(proxyRequest);
});

server.listen(publicPort, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "Render demo gateway listening",
      port: publicPort,
    }),
  );
});

const shutdown = () => {
  server.close(() => {
    process.exitCode = 0;
  });
  server.closeAllConnections();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
