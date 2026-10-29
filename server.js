"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIRECTORY = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "pass-data.json");
const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const STATUSES = new Set(["pending", "approved", "denied"]);
const DECISIONS = new Set(["approved", "denied"]);

let mutationQueue = Promise.resolve();

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isValidPass(pass) {
  return pass
    && typeof pass === "object"
    && typeof pass.id === "string"
    && typeof pass.studentName === "string"
    && typeof pass.destination === "string"
    && typeof pass.reason === "string"
    && typeof pass.issuedBy === "string"
    && STATUSES.has(pass.status)
    && typeof pass.createdAt === "string";
}

async function readPasses() {
  const contents = await fs.readFile(DATA_FILE, "utf8");
  const passes = JSON.parse(contents);
  if (!Array.isArray(passes) || !passes.every(isValidPass)) {
    throw new Error("Pass data must be a JSON array of valid pass records.");
  }
  return passes;
}

async function writePasses(passes) {
  const temporaryFile = `${DATA_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(passes, null, 2)}\n`, "utf8");
    await fs.rename(temporaryFile, DATA_FILE);
  } catch (error) {
    try {
      await fs.unlink(temporaryFile);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Could not remove temporary pass data file.", cleanupError);
      }
    }
    throw error;
  }
}

function updatePasses(update) {
  const operation = mutationQueue.then(async () => {
    const passes = await readPasses();
    const result = update(passes);
    await writePasses(passes);
    return result;
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

function validatePassInput(body) {
  const fields = [
    ["studentName", "Student name", 80],
    ["destination", "Destination", 120],
    ["reason", "Reason", 500],
    ["issuedBy", "Issued by", 80]
  ];
  const values = {};

  for (const [field, label, maximumLength] of fields) {
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (!value) {
      throw httpError(400, `${label} is required.`);
    }
    if (value.length > maximumLength) {
      throw httpError(400, `${label} must be ${maximumLength} characters or fewer.`);
    }
    values[field] = value;
  }

  return values;
}

app.disable("x-powered-by");
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "16kb" }));

app.get("/api/passes", async (request, response) => {
  const passes = await readPasses();
  passes.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
  response.json(passes);
});

app.post("/api/passes", async (request, response) => {
  const details = validatePassInput(request.body || {});
  const pass = {
    id: crypto.randomUUID(),
    ...details,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  await updatePasses((passes) => {
    passes.push(pass);
  });
  response.status(201).json(pass);
});

app.patch("/api/passes/:id", async (request, response) => {
  const status = request.body && request.body.status;
  if (!DECISIONS.has(status)) {
    throw httpError(400, "Status must be approved or denied.");
  }

  const pass = await updatePasses((passes) => {
    const currentPass = passes.find((item) => item.id === request.params.id);
    if (!currentPass) {
      throw httpError(404, "Pass not found.");
    }
    if (currentPass.status !== "pending") {
      throw httpError(409, "Only pending passes can be approved or denied.");
    }
    currentPass.status = status;
    currentPass.updatedAt = new Date().toISOString();
    return currentPass;
  });

  response.json(pass);
});

app.delete("/api/passes/:id", async (request, response) => {
  await updatePasses((passes) => {
    const index = passes.findIndex((item) => item.id === request.params.id);
    if (index === -1) {
      throw httpError(404, "Pass not found.");
    }
    passes.splice(index, 1);
  });
  response.status(204).end();
});

app.use("/api", (request, response) => {
  response.status(404).json({ error: "API route not found." });
});
app.use(express.static(PUBLIC_DIRECTORY));

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error.type === "entity.parse.failed") {
    response.status(400).json({ error: "Request body must contain valid JSON." });
    return;
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error("Request failed.", error);
  }
  response.status(statusCode).json({
    error: statusCode >= 500 ? "The request could not be completed." : error.message
  });
});

async function start() {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });
  try {
    await fs.writeFile(DATA_FILE, "[]\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await readPasses();

  app.listen(PORT, () => {
    console.log(`Hall Pass is running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Could not start Hall Pass.", error);
  process.exitCode = 1;
});
