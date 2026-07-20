// @ts-check
"use strict";

const vscode = require("vscode");

/** @type {vscode.WebviewPanel | undefined} */
let currentPanel;

// The workspace is mounted into the wasm's in-memory filesystem at this path,
// which TempleOS/HolyC sees as drive "T:\VSCode" (top-level dirs are drives).
const WORKSPACE_MOUNT_POINT = "/T/VSCode";
const IGNORED_DIR_NAMES = new Set([".git", "node_modules", ".vscode-test", "out", "dist"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip individual files larger than this
const MAX_TOTAL_BYTES = 32 * 1024 * 1024; // overall budget for the mounted workspace

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("visualHolyC.open", () => {
      createOrRevealPanel(context);
    }),
    vscode.commands.registerCommand("visualHolyC.restart", async () => {
      if (currentPanel) {
        currentPanel.webview.html = await getHtml(currentPanel.webview, context.extensionUri);
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
async function createOrRevealPanel(context) {
  if (currentPanel) {
    currentPanel.reveal(currentPanel.viewColumn ?? vscode.ViewColumn.Active);
    return;
  }

  const systemRoot = vscode.Uri.joinPath(context.extensionUri, "system");

  const panel = vscode.window.createWebviewPanel(
    "visualHolyC.aiwnios",
    "TempleOS",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [systemRoot],
    }
  );
  currentPanel = panel;

  panel.webview.html = await getHtml(panel.webview, context.extensionUri);

  panel.onDidDispose(
    () => {
      currentPanel = undefined;
    },
    null,
    context.subscriptions
  );
}

/**
 * Recursively reads the first workspace folder and returns a manifest of
 * { path, data } entries (data is base64), suitable for writing into the
 * wasm's MEMFS before TempleOS boots.
 */
async function buildWorkspaceManifest() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return { files: [], truncated: false, folderName: null };
  }

  const root = folders[0].uri;
  /** @type {{ path: string, data: string }[]} */
  const files = [];
  let totalBytes = 0;
  let truncated = false;

  /**
   * @param {vscode.Uri} dirUri
   * @param {string} relPath
   */
  async function walk(dirUri, relPath) {
    if (truncated) {
      return;
    }
    let entries;
    try {
      entries = await vscode.workspace.fs.readDirectory(dirUri);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      if (truncated) {
        return;
      }
      if (IGNORED_DIR_NAMES.has(name)) {
        continue;
      }
      const childUri = vscode.Uri.joinPath(dirUri, name);
      const childRel = relPath ? `${relPath}/${name}` : name;
      if (type === vscode.FileType.Directory) {
        await walk(childUri, childRel);
      } else if (type === vscode.FileType.File) {
        try {
          const stat = await vscode.workspace.fs.stat(childUri);
          if (stat.size > MAX_FILE_BYTES) {
            continue;
          }
          if (totalBytes + stat.size > MAX_TOTAL_BYTES) {
            truncated = true;
            return;
          }
          const bytes = await vscode.workspace.fs.readFile(childUri);
          totalBytes += bytes.byteLength;
          files.push({ path: childRel, data: Buffer.from(bytes).toString("base64") });
        } catch {
          // unreadable file (permissions, symlink loop, etc.) - skip it
        }
      }
    }
  }

  await walk(root, "");
  return { files, truncated, folderName: folders[0].name };
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
async function getHtml(webview, extensionUri) {
  const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "system", "aiwnios.js"));
  const wasmUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "system", "aiwnios.wasm"));
  const nonce = getNonce();
  const manifest = await buildWorkspaceManifest();
  // Escape "<" so a file path can never break out of the <script> block via "</script>".
  const manifestJson = JSON.stringify(manifest).replace(/</g, "\\u003c");
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
      const workspaceManifest = ${manifestJson};
      const MOUNT_ROOT = "/T/VSCode";

      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      window.addEventListener("click", () => canvas.focus());

      function setStatus(text) {
        statusEl.textContent = text || "";
      }

      function base64ToBytes(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }

      // Populate the wasm's MEMFS with the current VS Code workspace before
      // TempleOS boots, so it shows up there as drive "T:\\VSCode".
      function mountWorkspace() {
        if (!workspaceManifest.files.length) {
          return;
        }
        try {
          FS.mkdirTree(MOUNT_ROOT);
        } catch (e) {}
        for (const file of workspaceManifest.files) {
          const fullPath = MOUNT_ROOT + "/" + file.path;
          const dir = fullPath.slice(0, fullPath.lastIndexOf("/"));
          try {
            FS.mkdirTree(dir);
            FS.writeFile(fullPath, base64ToBytes(file.data));
          } catch (e) {
            console.error("[aiwnios] failed to mount", fullPath, e);
          }
        }
        setStatus(
          "mounted " +
            workspaceManifest.files.length +
            " file(s) from " +
            workspaceManifest.folderName +
            " at T:\\VSCode" +
            (workspaceManifest.truncated ? " (truncated)" : "")
        );
      }

      canvas.focus();

      window.Module = {
        canvas,
        locateFile: (path) => (path.endsWith(".wasm") ? wasmUri : path),
        print: (text) => console.log("[aiwnios]", text),
        printErr: (text) => console.error("[aiwnios]", text),
        setStatus: (text) => setStatus(text),
        preRun: [mountWorkspace],
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
