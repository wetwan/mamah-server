import * as Sentry from "@sentry/node"
// const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://6b471b6b72eabed558f43e233609f4ac@o4508836357603328.ingest.de.sentry.io/4510135909089360",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});