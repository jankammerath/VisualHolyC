// @ts-check
"use strict";

const vscode = require("vscode");

/** @type {vscode.WebviewPanel | undefined} */
let currentPanel;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("visualHolyC.open", () => {
      createOrRevealPanel(context);
    }),
    vscode.commands.registerCommand("visualHolyC.restart", () => {
      if (currentPanel) {
        currentPanel.webview.html = getHtml(currentPanel.webview, context.extensionUri);
        currentPanel.reveal(currentPanel.viewColumn);
      } else {
        createOrRevealPanel(context);
      }
    })
  );
}

/**
 * @param {vscode.ExtensionContext} context
 */
function createOrRevealPanel(context) {
  if (currentPanel) {
    currentPanel.reveal(currentPanel.viewColumn ?? vscode.ViewColumn.Active);
    return;
  }

  const systemRoot = vscode.Uri.joinPath(context.extensionUri, "system");

  currentPanel = vscode.window.createWebviewPanel(
    "visualHolyC.aiwnios",
    "TempleOS",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [systemRoot],
    }
  );

  currentPanel.webview.html = getHtml(currentPanel.webview, context.extensionUri);

  currentPanel.onDidDispose(
    () => {
      currentPanel = undefined;
    },
    null,
    context.subscriptions
  );
}

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 */
function getHtml(webview, extensionUri) {
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "system", "aiwnios.js"));
  const wasmUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "system", "aiwnios.wasm"));
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'`,
    `connect-src ${webview.cspSource}`,
  ].join("; ");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>TempleOS</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
  }
  #container {
    position: fixed;
    inset: 0;
  }
  #canvas {
    width: 100%;
    height: 100%;
    display: block;
    outline: none;
    image-rendering: pixelated;
  }
  #status {
    position: fixed;
    bottom: 4px;
    left: 8px;
    color: #33ff33;
    font-family: monospace;
    font-size: 11px;
    z-index: 5;
    opacity: 0.8;
    pointer-events: none;
  }
</style>
</head>
<body>
  <div id="container">
    <canvas id="canvas" tabindex="-1"></canvas>
  </div>
  <div id="status"></div>
  <script nonce="${nonce}">
    (function () {
      const canvas = document.getElementById("canvas");
      const statusEl = document.getElementById("status");
      const wasmUri = ${JSON.stringify(wasmUri.toString())};
      const jsUri = ${JSON.stringify(jsUri.toString())};

      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      window.addEventListener("click", () => canvas.focus());

      function setStatus(text) {
        statusEl.textContent = text || "";
      }

      canvas.focus();

      window.Module = {
        canvas,
        locateFile: (path) => (path.endsWith(".wasm") ? wasmUri : path),
        print: (text) => console.log("[aiwnios]", text),
        printErr: (text) => console.error("[aiwnios]", text),
        setStatus: (text) => setStatus(text),
        onRuntimeInitialized: () => setStatus("running"),
      };

      setStatus("loading...");
      const script = document.createElement("script");
      script.nonce = ${JSON.stringify(nonce)};
      script.src = jsUri;
      script.onerror = () => setStatus("failed to load aiwnios.js");
      document.body.appendChild(script);
    })();
  </script>
</body>
</html>`;
}

function deactivate() {
  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = undefined;
  }
}

module.exports = {
  activate,
  deactivate,
};
