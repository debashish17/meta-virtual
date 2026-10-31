import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SHARED_HELLO } from "@office/shared";
import { OfficeRoom } from "./office.room.js";
import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const PORT = Number(process.env.PORT ?? 2567);

console.log(`[server] shared constant: ${SHARED_HELLO}`);

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use(express.json({ limit: "25mb" }));
    app.use((_req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    app.get("/health", (_req, res) => {
      res.json({ ok: true, shared: SHARED_HELLO });
    });

    app.post("/api/save_snapshot", (req, res) => {
      try {
        const { name, image } = req.body;
        if (!name || !image) {
          return res.status(400).json({ error: "Missing name or image" });
        }
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const repoRoot = path.resolve(import.meta.dirname, "../../..");
        const outDir = path.resolve(repoRoot, "blender-asset-pipeline/output/pipeline_v2");
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, `${name}_render.png`), base64Data, "base64");
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });

    app.post("/api/refine_asset", (req, res) => {
      try {
        const { asset_id } = req.body;
        if (!asset_id) {
          return res.status(400).json({ error: "Missing asset_id" });
        }
        const stem = String(asset_id).replace(/^ref\./, "");
        const repoRoot = path.resolve(import.meta.dirname, "../../..");
        const scriptPath = path.resolve(repoRoot, "blender-asset-pipeline/pipeline_v2/run_refiner_batch.py");

        console.log(`[server] Spawning Refiner Agent for: ${stem}...`);
        const proc = spawn("python", [scriptPath, "--asset", stem, "--target-score", "85.0", "--max-iterations", "3"], {
          cwd: repoRoot,
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => { stdout += d.toString(); });
        proc.stderr.on("data", (d) => { stderr += d.toString(); });

        proc.on("close", (code) => {
          if (code !== 0) {
            console.error(`[server] Refiner failed (code ${code}):`, stderr);
            return res.status(500).json({ error: stderr || "Refinement failed" });
          }

          // Read updated review JSON
          const reviewJsonPath = path.resolve(repoRoot, `apps/web/public/assets/reviews/${stem}_review.json`);
          if (fs.existsSync(reviewJsonPath)) {
            const data = JSON.parse(fs.readFileSync(reviewJsonPath, "utf-8"));
            console.log(`[server] Refiner successfully completed for ${stem}! Final score: ${data.overall_score}%`);
            return res.json({ ok: true, review: data });
          }

          res.json({ ok: true, message: stdout });
        });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  },
});

gameServer.define("office", OfficeRoom);

await gameServer.listen(PORT);
console.log(`[server] office room listening on :${PORT} (${SHARED_HELLO})`);
