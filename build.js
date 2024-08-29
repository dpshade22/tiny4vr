import { build } from "bun";
import { execSync } from "child_process";
import { cpSync, mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";

// Delete existing dist directory
console.log("Deleting existing dist directory...");
rmSync("dist", { recursive: true, force: true });

// Create dist directory
mkdirSync("dist", { recursive: true });

// Copy files to dist
const filesToCopy = [
  { from: "src/index.html", to: "dist/index.html" },
  { from: "src/css/", to: "dist/css/" },
  { from: "src/assets/", to: "dist/assets/" },
  { from: "ao/main.lua", to: "dist/lua/main.lua" },
];

filesToCopy.forEach((file) => {
  const destinationDir = resolve(file.to).split("/").slice(0, -1).join("/");
  mkdirSync(destinationDir, { recursive: true });
  cpSync(file.from, file.to, { recursive: true });
});

// Bundle the application
let result = await build({
  entrypoints: ["src/js/index.js"],
  outdir: "dist/js",
  minify: true,
  target: "browser",
  define: {
    global: "globalThis",
    "process.env": JSON.stringify(process.env),
  },
  plugins: [
    {
      name: "node-polyfills",
      setup(build) {
        build.onResolve({ filter: /^(buffer|crypto)$/ }, (args) => {
          return { path: args.path, namespace: "node-polyfill" };
        });
        build.onLoad({ filter: /.*/, namespace: "node-polyfill" }, (args) => {
          if (args.path === "buffer") {
            return { contents: `export * from "buffer/"` };
          }
          if (args.path === "crypto") {
            return { contents: `export * from "crypto-browserify"` };
          }
        });
      },
    },
  ],
});

console.log(result);
console.log("Build completed successfully!");
