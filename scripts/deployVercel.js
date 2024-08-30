import { $ } from "bun";

async function deploy() {
  console.log("Running build process...");

  try {
    // Run the build process
    await $`bun run scripts/build.js`;

    console.log("Build completed successfully. Deploying to Vercel...");

    // Deploy to Vercel
    const vercelOutput =
      await $`vercel ../dist --yes --scope dpshade22 --name tiny4vr`.text();

    console.log(vercelOutput);
    console.log("Deployment to Vercel completed successfully.");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

deploy();
