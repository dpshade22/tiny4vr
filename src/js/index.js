import { createDataItemSigner, message, result } from "@permaweb/aoconnect";
import { arGql } from "ar-gql";
import { ArConnect } from "arweavekit/auth";
import * as othent from "@othent/kms";

// Constants
const PROCESS_ID = "sycgVh1YzqZVY8j48j0wNuoyKDcyFhDPmw4fE8nDzrA";
const argql = arGql();

// Wallet Connection Component
class ArweaveWalletConnection extends HTMLElement {
  constructor() {
    super();
    this.walletAddress = null;
    this.signer = null;
    this.authMethod = null;
    this.attachShadow({ mode: "open" });
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        button {
          padding: 10px 20px;
          background-color: #4a90e2;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.3s;
          width: 100%;
          margin-top: 10px;
        }
        button:hover {
          background-color: #357ab8;
        }
      </style>
      <button id="connectWalletButton">Connect Wallet</button>
    `;
    this.connectWalletButton = this.shadowRoot.getElementById(
      "connectWalletButton",
    );
    this.connectWalletButton.addEventListener(
      "click",
      this.handleWalletConnection.bind(this),
    );
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
        console.log(`Wallet connected successfully: ${this.walletAddress}`);
        this.signer = createDataItemSigner(
          this.authMethod === "Othent" ? othent : window.arweaveWallet,
        );
        this.updateUIAfterConnect();
        return true;
      } else {
        throw new Error("Failed to obtain wallet address");
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
      alert("Failed to connect wallet. Please try again.");
      return false;
    }
  }

  async tryArConnect() {
    try {
      await ArConnect.connect({
        permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"],
      });
      this.walletAddress = await window.arweaveWallet.getActiveAddress();
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
        tags: tags,
        signer: this.signer,
      });

      let { Messages, Error } = await result({
        process: PROCESS_ID,
        message: messageId,
      });

      if (Error) throw new Error(Error);
      console.log(
        `Sent Action: ${tags.find((tag) => tag.name == "Action").value}`,
      );

      return { Messages, Error };
    } catch (error) {
      console.error("Error sending message to Arweave:", error);
      throw error;
    }
  }

  updateUIAfterConnect() {
    this.connectWalletButton.textContent = `Connected: ${this.walletAddress.slice(0, 5)}...${this.walletAddress.slice(-5)}`;
  }
}

// UI Functions
async function handleSubmit(event) {
  event.preventDefault();
  const longUrl = document.getElementById("longUrl").value;
  if (!longUrl) {
    alert("Please enter a URL.");
    return;
  }

  try {
    const existingShortCode = await getExistingShortCode(longUrl);
    if (existingShortCode) {
      showShortUrl(existingShortCode);
    } else {
      await createShortUrl(longUrl);
    }
  } catch (error) {
    console.error("Error handling URL submission:", error);
    showMainUI(`An error occurred: ${error.message}`);
  }
}

async function createShortUrl(longUrl) {
  const walletConnection = document.querySelector("arweave-wallet-connection");

  if (!walletConnection) {
    showMainUI(
      "Wallet connection component not found. Please refresh the page and try again.",
    );
    return;
  }

  if (!walletConnection.walletAddress) {
    const connected = await walletConnection.connectWallet();
    if (!connected) {
      showMainUI(
        "Wallet connection is required to create a new short URL. Please try again.",
      );
      return;
    }
  }

  try {
    const { Messages, Error } = await walletConnection.sendMessageToArweave([
      { name: "Action", value: "CreateShortURL" },
      { name: "LongURL", value: longUrl },
    ]);

    if (Error) throw new Error(Error);

    const response = JSON.parse(Messages[0].Data);
    if (response.error) throw new Error(response.error);

    showShortUrl(response.shortCode);
  } catch (error) {
    console.error("Error creating short URL:", error);
    showMainUI(
      `An error occurred while creating the short URL: ${error.message}`,
    );
  }
}

function showMainUI(message = "") {
  const previousUrl = document.getElementById("longUrl")?.value;
  document.body.innerHTML = `
    <div class="container">
      <h1><img src="./assets/4vrtiny.png" alt="4vrtiny" class="logo"></h1>
      <form id="urlForm">
        <input type="url" id="longUrl" placeholder="Enter long URL" required />
        <button type="submit" id="submitUrlButton">Submit URL</button>
      </form>
      ${message ? `<div id="result">${message}</div>` : ""}
      <arweave-wallet-connection></arweave-wallet-connection>
    </div>
  `;

  document.getElementById("urlForm").addEventListener("submit", handleSubmit);
  if (previousUrl) {
    document.getElementById("longUrl").value = previousUrl;
  }

  // Ensure the wallet connection component is fully defined before proceeding
  customElements.whenDefined("arweave-wallet-connection").then(() => {
    console.log("ArweaveWalletConnection component is now defined");
  });
}

function showShortUrl(shortCode) {
  const currentUrl = window.location.href;
  const baseUrl = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;
  const shortUrl = `${baseUrl}${shortCode}`;
  showMainUI(
    `Your short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`,
  );
}

// Arweave Query Functions
async function getExistingShortCode(longUrl) {
  const query = `
    query {
      transactions(
        tags: [
          { name: "App-Name", values: ["4vrtiny"] }
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

  const results = await argql.run(query);
  if (results.data.transactions.edges.length > 0) {
    const tags = results.data.transactions.edges[0].node.tags;
    return tags.find((tag) => tag.name === "Short-Code")?.value;
  }
  return null;
}

async function lookupAndRedirect(shortCode) {
  console.log("Looking up short code:", shortCode);
  try {
    const query = `
      query {
        transactions(
          tags: [
            { name: "App-Name", values: ["4vrtiny"] }
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

    const results = await argql.run(query);
    if (results.data.transactions.edges.length > 0) {
      const tags = results.data.transactions.edges[0].node.tags;
      const longURL = tags.find((tag) => tag.name === "Long-URL")?.value;

      if (longURL) {
        console.log("Redirecting to:", longURL);
        window.location.href = longURL;
      } else {
        throw new Error("Long URL not found for this short code");
      }
    } else {
      throw new Error("Short code not found");
    }
  } catch (error) {
    console.error("Error during lookup:", error);
    showMainUI(`An error occurred: ${error.message}`);
  }
}

// Utility Functions
function getShortCodeFromPath() {
  const path = window.location.pathname;
  const match = path.match(/([A-Za-z0-9]{6})\/?$/);
  return match ? match[1] : null;
}

function handlePath() {
  const shortCode = getShortCodeFromPath();
  if (shortCode) {
    console.log("Short code found in URL, performing lookup");
    lookupAndRedirect(shortCode);
  } else {
    console.log("No short code in URL, showing form");
    showMainUI();
  }
}

// Event Listeners
window.onload = handlePath;
window.onpopstate = handlePath;
