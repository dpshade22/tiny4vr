import { spawn } from "child_process";
import { watch } from "fs";
import { join, resolve } from "path";

const rootDir = resolve(__dirname, "..");

const buildProcess = spawn("bun", ["run", "scripts/build.js"], {
    stdio: "inherit",
});

buildProcess.on("exit", (code) => {
    if (code === 0) {
        console.log("Build completed successfully.");
        startServer();
    } else {
        console.error("Build failed with code:", code);
    }
});

function startServer() {
    console.log("Starting server...");

    Bun.serve({
        port: 3001,
        async fetch(req) {
            const url = new URL(req.url);
            const path = url.pathname;

            // Check if the request is for a static asset
            if (
                path.startsWith("/assets/") ||
                path.startsWith("/css/") ||
                path.startsWith("/js/")
            ) {
                const file = Bun.file(join(rootDir, "dist", path));
                return file.exists().then((exists) => {
                    if (exists) {
                        const headers = new Headers({
                            "Cache-Control": "no-cache",
                            "Access-Control-Allow-Origin": "*",
                        });
                        return new Response(file, { headers });
                    } else {
                        return new Response("Not Found", { status: 404 });
                    }
                });
            }

            // For all other requests, serve index.html
            const indexFile = Bun.file(join(rootDir, "dist", "index.html"));
            const headers = new Headers({
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            });
            return new Response(indexFile, { headers });
        },
    });

    console.log("Server started on http://localhost:3001");

    // Watch for changes and rebuild
    watch(join(rootDir, "src"), { recursive: true }, (event, filename) => {
        console.log(`File ${filename} changed. Rebuilding...`);
        spawn("bun", ["run", "scripts/build.js"], { stdio: "inherit" });
    });
}