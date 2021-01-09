import express from "express";

export default function createApp() {
  const app = express();
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log("listening to port *:%d, press ctrl + c to cancel", port);
  });

  process.on("SIGTERM", () => {
    console.info("SIGTERM signal received: closing HTTP server");
    server.close(() => {
      console.log("HTTP server closed");
      redis.flushall();
      redis.quit();
      db.end();
    });
  });
  return app;
}
