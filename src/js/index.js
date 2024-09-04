import { createDataItemSigner, message, result } from "@permaweb/aoconnect";
import { arGql } from "ar-gql";
import { ArConnect } from "arweavekit/auth";
import * as othent from "@othent/kms";

const PROCESS_ID = "BF0bKG5TVrnc9rDOMH3hRZSFwiuI8dloh-KMeZwi4cI";
const argql = arGql();

class ArweaveWalletConnection extends HTMLElement {
  constructor() {
    super();
    this.walletAddress = null;
    this.signer = null;
    this.authMethod = null;
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = this.getTemplate();
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
    `;
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

customElements.define("arweave-wallet-connection", ArweaveWalletConnection);

function showMainUI(message = "", isLoading = false) {
  const previousUrl = document.getElementById("longUrl")?.value;
  document.body.innerHTML = `
    <div class="container">
      <h1><img src="./assets/tiny4vr.png" alt="tiny4vr" class="logo"></h1>
      <form id="urlForm">
        <input type="url" id="longUrl" placeholder="Enter long URL" required value="${previousUrl || ""}"/>
        <button type="submit">Submit URL</button>
      </form>
      ${isLoading ? `<div class="loading-container"><div class="loading"></div></div>` : ""}
      ${message ? `<div id="result">${message}</div>` : ""}
      <arweave-wallet-connection></arweave-wallet-connection>
    </div>
  `;
  document.getElementById("urlForm").addEventListener("submit", handleSubmit);
}

async function handleSubmit(event) {
  event.preventDefault();
  const longUrl = document.getElementById("longUrl").value;
  if (!longUrl) {
    alert("Please enter a URL.");
    return;
  }

  try {
    showMainUI("", true);
    const existingShortCode = await getExistingShortCode(longUrl);
    if (existingShortCode) {
      showShortUrl(existingShortCode);
    } else {
      const walletConnection = document.querySelector(
        "arweave-wallet-connection",
      );
      if (
        !walletConnection.walletAddress &&
        !(await walletConnection.connectWallet())
      ) {
        showMainUI(
          "Wallet connection is required to create a new short URL. Please try again.",
        );
        return;
      }
      await createShortUrl(longUrl);
    }
  } catch (error) {
    console.error("Error handling URL submission:", error);
    showMainUI(`An error occurred: ${error.message}`);
  }
}

async function createShortUrl(longUrl) {
  const walletConnection = document.querySelector("arweave-wallet-connection");
  try {
    showMainUI("", true);
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
    showMainUI(
      `An error occurred while creating the short URL: ${error.message}`,
    );
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
        tags.find((tag) => tag.name === "Short-Code")?.value || null;

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
  showMainUI("", true);
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
      const longURL = tags.find((tag) => tag.name === "Long-URL")?.value;
      if (longURL) {
        window.location.href = longURL;
      } else {
        showMainUI("Short code not found.");
      }
    } else {
      showMainUI("Short code not found.");
    }
  } catch (error) {
    console.error("Error during lookup:", error);
    showMainUI("An error occurred while looking up the URL.");
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
  } else {
    showMainUI();
  }
}

function showShortUrl(shortCode) {
  const currentUrl = window.location.href;
  const baseUrl = currentUrl.endsWith("/") ? currentUrl : `${currentUrl}/`;
  const shortUrl = `${baseUrl}${shortCode}`;
  showMainUI(
    `Your short URL: <a href="${shortUrl}" target="_blank">${shortUrl}</a>`,
  );
}

window.onload = handlePath;
window.onpopstate = handlePath;
