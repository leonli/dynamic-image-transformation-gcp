import express, { Request, Response } from "express";

import { handleRequest } from "./request-handler";

const app = express();
app.disable("x-powered-by");

// Cloud Run health probe endpoint (not part of the AWS-compatible surface; the AWS
// solution has no reserved paths, but "/__health" is not a valid image request anyway).
app.get("/__health", (_req: Request, res: Response) => {
  res.status(200).send("ok");
});

// Every other GET is an image request — DEFAULT (base64 JSON), THUMBOR or CUSTOM.
app.get(/.*/, async (req: Request, res: Response) => {
  const result = await handleRequest(req.path, req.query, req.headers as Record<string, string>);
  res.status(result.statusCode);
  for (const [name, value] of Object.entries(result.headers)) {
    res.setHeader(name, value);
  }
  res.send(result.body);
});

const port = Number(process.env.PORT ?? 8080);
if (require.main === module) {
  app.listen(port, () => {
    // Structured log line for Cloud Logging
    console.log(JSON.stringify({ severity: "INFO", message: `image-handler listening on ${port}` }));
  });
}

export { app };
