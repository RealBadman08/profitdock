import serverless from "serverless-http";
import app from "../../server/app"; // We will refactor server/index.ts to export 'app' from a new file or modify it.

export const handler = serverless(app);
