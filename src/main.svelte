<script>
    import { onMount } from "svelte";
    import { createDataItemSigner, message, result } from "@permaweb/aoconnect";
    import { arGql } from "ar-gql";
    import { ArConnect } from "arweavekit/auth";
    import * as othent from "@othent/kms";

    const PROCESS_ID = "BF0bKG5TVrnc9rDOMH3hRZSFwiuI8dloh-KMeZwi4cI";
    const argql = arGql();

    let walletAddress = null;
    let signer = null;
    let authMethod = null;
    let longUrl = "";
    let resultMessage = "";
    let isLoading = false;

    onMount(() => {
        handlePath();
    });

    class ArweaveWalletConnection {
        constructor() {
            this.walletAddress = null;
            this.signer = null;
            this.authMethod = null;
        }

        async handleWalletConnection() {
            if (!this.walletAddress) {
                await this.connectWallet();
            } else {
                alert(`Already connected: ${this.walletAddress}`);
            }
        }

        async connectWallet() {
            try {
                (await this.tryArConnect()) || (await this.tryOthent());
                if (this.walletAddress) {
                    console.log(
                        `Wallet connected successfully: ${this.walletAddress}`,
                    );
                    this.signer = createDataItemSigner(
                        this.authMethod === "Othent"
                            ? othent
                            : window.arweaveWallet,
                    );
                    return true;
                }
                console.error("Failed to obtain wallet address");
            } catch (error) {
                console.error("Wallet connection failed:", error);
                alert("Failed to connect wallet. Please try again.");
            }
            return false;
        }

        async tryArConnect() {
            try {
                await ArConnect.connect({
                    permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"],
                });
                this.walletAddress =
                    await window.arweaveWallet.getActiveAddress();
                this.authMethod = "ArConnect";
                return true;
            } catch (error) {
                console.warn("ArConnect connection failed:", error);
                return false;
            }
        }

        async tryOthent() {
            try {
                await othent.connect({
                    permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"],
                });
                this.walletAddress = await othent.getActiveAddress();
                this.authMethod = "Othent";
                return true;
            } catch (error) {
                console.error("Othent connection failed:", error);
                throw error;
            }
        }

        async sendMessageToArweave(tags) {
            try {
                const messageId = await message({
                    process: PROCESS_ID,
                    tags,
                    signer: this.signer,
                });
                let { Messages, Error } = await result({
                    process: PROCESS_ID,
                    message: messageId,
                });
                if (Error) console.error(Error);
                else
                    console.log(
                        `Sent Action: ${tags.find((tag) => tag.name === "Action").value}`,
                    );
                return { Messages, Error };
            } catch (error) {
                console.error("Error sending message:", error);
                throw error;
            }
        }
    }

    const walletConnection = new ArweaveWalletConnection();

    async function handleSubmit() {
        if (!longUrl) {
            alert("Please enter a URL.");
            return;
        }

        try {
            isLoading = true;
            resultMessage = "";
            const existingShortCode = await getExistingShortCode(longUrl);
            if (existingShortCode) {
                showShortUrl(existingShortCode);
            } else {
                if (
                    !walletConnection.walletAddress &&
                    !(await walletConnection.connectWallet())
                ) {
                    resultMessage =
                        "Wallet connection is required to create a new short URL. Please try again.";
                    return;
                }
                await createShortUrl(longUrl);
            }
        } catch (error) {
            console.error("Error handling URL submission:", error);
            resultMessage = `An error occurred: ${error.message}`;
        } finally {
            isLoading = false;
        }
    }

    async function createShortUrl(longUrl) {
        try {
            isLoading = true;
            resultMessage = "";
            let shortCode;
            do {
                shortCode = generateShortCode();
            } while (await shortCodeExists(shortCode));

            const tags = [
                { name: "Action", value: "CreateShortURL" },
                { name: "Long-URL", value: longUrl },
                { name: "Short-Code", value: shortCode },
            ];

            await walletConnection.sendMessageToArweave(tags);
            console.log("Short code created:", shortCode);
            showShortUrl(shortCode);
        } catch (error) {
            console.error("Error creating short URL:", error);
            resultMessage = `An error occurred while creating the short URL: ${error.message}`;
        } finally {
            isLoading = false;
        }
    }

    function generateShortCode(length = 6) {
        const chars =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        return Array.from({ length }, () =>
            chars.charAt(Math.floor(Math.random() * chars.length)),
        ).join("");
    }

    async function shortCodeExists(shortCode) {
        const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["tiny4vr"] }
            { name: "Short-Code", values: ["${shortCode}"] }
            { name: "From-Process", values: ["${PROCESS_ID}"] }
          ]
          first: 1
        ) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

        try {
            const results = await argql.run(query);
            return results.data.transactions.edges.length > 0;
        } catch (error) {
            console.error("Error checking short code existence:", error);
            throw error;
        }
    }

    async function getExistingShortCode(longUrl) {
        console.log(`Checking for existing short code for URL: ${longUrl}`);
        const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["tiny4vr"] }
            { name: "Long-URL", values: ["${longUrl}"] }
            { name: "From-Process", values: ["${PROCESS_ID}"] }
          ]
          first: 1
        ) {
          edges {
            node {
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

        try {
            const results = await argql.run(query);
            console.log("Query results:", results);

            if (results.data.transactions.edges.length > 0) {
                const tags = results.data.transactions.edges[0].node.tags;
                const shortCode =
                    tags.find((tag) => tag.name === "Short-Code")?.value ||
                    null;

                if (shortCode) {
                    console.log(`Existing short code found: ${shortCode}`);
                } else {
                    console.log("No short code found in the transaction tags");
                }

                return shortCode;
            }

            console.log("No existing transaction found for this URL");
            return null;
        } catch (error) {
            console.error("Error in getExistingShortCode:", error);
            throw error;
        }
    }

    async function lookupAndRedirect(shortCode) {
        isLoading = true;
        resultMessage = "";
        const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["tiny4vr"] }
            { name: "Short-Code", values: ["${shortCode}"] }
            { name: "From-Process", values: ["${PROCESS_ID}"] }
          ]
          first: 1
        ) {
          edges {
            node {
              tags {
                name
                value
              }
            }
          }
        }
      }
    `;

        try {
            const results = await argql.run(query);
            if (results.data.transactions.edges.length > 0) {
                const tags = results.data.transactions.edges[0].node.tags;
                const longURL = tags.find(
                    (tag) => tag.name === "Long-URL",
                )?.value;
                if (longURL) {
                    window.location.href = longURL;
                } else {
                    resultMessage = "Short code not found.";
                }
            } else {
                resultMessage = "Short code not found.";
            }
        } catch (error) {
            console.error("Error during lookup:", error);
            resultMessage = "An error occurred while looking up the URL.";
        } finally {
            isLoading = false;
        }
    }

    function getShortCodeFromPath() {
        const match = window.location.pathname.match(/([A-Za-z0-9]{6})\/?$/);
        return match ? match[1] : null;
    }

    function handlePath() {
        const shortCode = getShortCodeFromPath();
        if (shortCode) {
            lookupAndRedirect(shortCode);
        }
    }

    function showShortUrl(shortCode) {
        const currentUrl = window.location.href;
        const baseUrl = currentUrl.endsWith("/")
            ? currentUrl
            : `${currentUrl}/`;
        const shortUrl = `${baseUrl}${shortCode}`;
        resultMessage = `Your short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`;
    }
</script>

<main>
    <div class="container">
        <h1><img src="./assets/tiny4vr.png" alt="tiny4vr" class="logo" /></h1>
        <form on:submit|preventDefault={handleSubmit}>
            <input
                type="url"
                bind:value={longUrl}
                placeholder="Enter long URL"
                required
            />
            <button type="submit">Submit URL</button>
        </form>
        {#if isLoading}
            <div class="loading-container"><div class="loading"></div></div>
        {/if}
        {#if resultMessage}
            <div id="result">{@html resultMessage}</div>
        {/if}
    </div>
</main>

<style>
    :global(:root) {
        --bg-color: #0d0d0d;
        --container-bg: #121212;
        --input-bg: #3a3a3a;
        --input-focus-bg: #2a2a2a;
        --button-bg: #5cceff;
        --button-hover-bg: #1fbcff;
        --text-color: #ffffff;
        --placeholder-color: #999;
        --link-color: #5cceff;
        --link-hover-color: #1fbcff;
    }

    :global(body) {
        font-family: "Arial", sans-serif;
        background-color: var(--bg-color);
        color: var(--text-color);
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
    }

    .container {
        background-color: var(--container-bg);
        border-radius: 0.2rem;
        padding: 30px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        max-width: 400px;
        width: 100%;
    }

    .logo {
        max-width: 200px;
        height: auto;
        display: block;
        margin: 0 auto;
    }

    h1 {
        text-align: center;
        margin-bottom: 20px;
    }

    form {
        display: flex;
        flex-direction: column;
    }

    input[type="url"] {
        padding: 10px;
        margin-bottom: 15px;
        border: none;
        border-radius: 5px;
        background-color: var(--input-bg);
        color: var(--text-color);
        outline: none;
        transition: all 0.3s ease;
    }

    input[type="url"]:focus {
        background-color: var(--input-focus-bg);
        box-shadow: 0 0 0 2px rgba(92, 206, 255, 0.5);
    }

    input[type="url"]::placeholder {
        color: var(--placeholder-color);
    }

    /* Autofill styles for both Webkit and Firefox */
    input[type="url"]:-webkit-autofill,
    input[type="url"]:-webkit-autofill:hover,
    input[type="url"]:-webkit-autofill:focus,
    input[type="url"]:autofill,
    input[type="url"]:autofill:hover,
    input[type="url"]:autofill:focus {
        -webkit-text-fill-color: var(--text-color);
        -webkit-box-shadow: 0 0 0px 1000px var(--input-focus-bg) inset;
        transition: background-color 5000s ease-in-out 0s;
        filter: none;
    }

    button {
        padding: 10px 20px;
        background-color: var(--button-bg);
        color: var(--text-color);
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.3s;
    }

    button:hover,
    :global(#submitUrlButton:hover) {
        background-color: var(--button-hover-bg);
    }

    #result {
        margin-top: 20px;
        padding: 15px;
        background-color: #1e1e1e;
        border-radius: 5px;
        border-left: 4px solid var(--button-bg);
        font-size: 14px;
        line-height: 1.4;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        overflow-x: auto;
        animation: fadeIn 0.3s ease-out;
    }

    #result::before {
        content: "🔗";
        margin-right: 10px;
        font-size: 18px;
    }

    :global(#result a) {
        color: var(--link-color);
        text-decoration: none;
        font-weight: bold;
        transition: color 0.3s ease;
    }

    :global(#result a:hover) {
        color: var(--link-hover-color);
        text-decoration: underline;
    }

    .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 20px;
    }

    .loading {
        width: 30px;
        height: 30px;
        border: 3px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: #fff;
        animation: spin 1s ease-in-out infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media screen and (max-width: 768px) {
        :global(body) {
            overflow: hidden;
        }

        .container {
            max-height: 100vh;
            overflow-y: auto;
        }
    }
</style>
