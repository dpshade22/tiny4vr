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
  }

  getTemplate() {
    return `
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
  }

  initElements() {
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
      }).catch(console.error);

      let { Messages, Error } = await result({
        process: PROCESS_ID,
        message: messageId,
      });

      if (Error) console.error(Error);
      else
        console.log(
          `Sent Action: ${tags.find((tag) => tag.name == "Action").value}`,
        );

      return { Messages, Error };
    } finally {
      console.log("Message sent");
    }
  }

  updateUIAfterConnect() {
    this.connectWalletButton.textContent = `Connected: ${this.walletAddress.slice(0, 5)}...${this.walletAddress.slice(-5)}`;
  }
}

customElements.define("arweave-wallet-connection", ArweaveWalletConnection);

// UI Functions
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

  // Set up event listeners
  document.getElementById("urlForm").addEventListener("submit", handleSubmit);

  // Restore the previous URL if it exists
  if (previousUrl) {
    document.getElementById("longUrl").value = previousUrl;
  }
}

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
      // URL already exists, show the short URL
      const currentUrl = window.location.href;
      const baseUrl = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;
      const shortUrl = baseUrl + existingShortCode;
      showMainUI(
        `Existing short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`,
      );
    } else {
      // URL doesn't exist, attempt to connect wallet and create short URL
      const walletConnection = document.querySelector(
        "arweave-wallet-connection",
      );
      if (!walletConnection.walletAddress) {
        const connected = await walletConnection.connectWallet();
        if (!connected) {
          showMainUI(
            "Wallet connection is required to create a new short URL. Please try again.",
          );
          return;
        }
      }
      await createShortUrl(longUrl);
    }
  } catch (error) {
    console.error("Error handling URL submission:", error);
    showMainUI(`An error occurred: ${error.message}`);
  }
}

// URL Operations
async function checkUrl() {
  const longUrlInput = document.getElementById("longUrl");
  const longUrl = longUrlInput.value;
  if (!longUrl) {
    alert("Please enter a URL to check.");
    return;
  }

  try {
    const existingShortCode = await getExistingShortCode(longUrl);
    if (existingShortCode) {
      // Ensure the URL ends with a slash before appending the short code
      const currentUrl = window.location.href;
      const baseUrl = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;
      const shortUrl = baseUrl + existingShortCode;

      showMainUI(
        `Existing short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`,
      );
    } else {
      showMainUI(
        "This URL hasn't been shortened yet. Please connect your wallet to submit it.",
      );
    }

    // After showing the main UI, set the input value back to the original URL
    document.getElementById("longUrl").value = longUrl;

    // Update button visibility
    document.getElementById("checkUrlButton").style.display = "none";
    document.getElementById("submitUrlButton").style.display = "block";
  } catch (error) {
    console.error("Error checking URL:", error);
    showMainUI(`An error occurred while checking the URL: ${error.message}`);
  }
}

async function submitUrl() {
  const longUrl = document.getElementById("longUrl").value;
  const walletConnection = document.querySelector("arweave-wallet-connection");

  if (!walletConnection.walletAddress) {
    alert("Please connect your wallet first.");
    return;
  }

  createShortUrl(longUrl);
}

async function createShortUrl(longUrl) {
  console.log("Creating short URL for:", longUrl);
  const walletConnection = document.querySelector("arweave-wallet-connection");

  if (!walletConnection.walletAddress) {
    alert("Please connect your wallet first.");
    return;
  }

  try {
    const tags = [
      { name: "Action", value: "CreateShortURL" },
      { name: "LongURL", value: longUrl },
    ];

    const { Messages, Error } =
      await walletConnection.sendMessageToArweave(tags);

    if (Error) {
      throw new Error(Error);
    }

    const response = JSON.parse(Messages[0].Data);
    if (response.error) {
      throw new Error(response.error);
    }

    const shortCode = response.shortCode;
    console.log("Short code received from backend:", shortCode);

    const currentUrl = window.location.href;
    const baseUrl = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;
    const shortUrl = `${baseUrl}${shortCode}`;
    showMainUI(
      `Your new short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`,
    );
  } catch (error) {
    console.error("Error creating short URL:", error);
    showMainUI(
      `An error occurred while creating the short URL: ${error.message}`,
    );
  }
}

// Arweave Query Functions
async function getExistingShortCode(longUrl) {
  const query = `
    query {
      transactions(
        tags: [
          { name: "App-Name", values: ["4vrtiny"] }
          { name: "Long-URL", values: ["${longUrl}"] }
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
    console.log("Query results:", results);

    if (results.data.transactions.edges.length > 0) {
      const tags = results.data.transactions.edges[0].node.tags;
      const longURL = tags.find((tag) => tag.name === "Long-URL")?.value;

      if (longURL) {
        console.log("Redirecting to:", longURL);
        window.location.href = longURL;
      } else {
        console.error("Long URL not found for this short code");
        showMainUI("Short code not found.");
      }
    } else {
      console.error("Short code not found");
      showMainUI("Short code not found.");
    }
  } catch (error) {
    console.error("Error during lookup:", error);
    showMainUI("An error occurred while looking up the URL.");
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
