# VisualHolyC

Run **TempleOS** inside VS Code, via [aiwnios.wasm](https://templeos.reiko.app/) — a WebAssembly port
of TempleOS/HolyC.

[Visual HolyC](./assets/visualholyc-box.png)

## Usage

1. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Run **VisualHolyC: TempleOS: Boot aiwnios.wasm** — the OS boots immediately.
3. Use **VisualHolyC: TempleOS: Restart** to reset the running instance.

The panel keeps running in the background (`retainContextWhenHidden`), so switching editor
tabs won't reset the OS state.

## HolyC language support

`.hc`/`.HC` files get syntax highlighting via a bundled TextMate grammar (`syntaxes/holyc.tmLanguage.json`).

To also show the HolyC icon (`assets/HolyC.png`) on `.hc` files in the Explorer, enable the file
icon theme this extension contributes:

1. Open the Command Palette and run **Preferences: File Icon Theme**.
2. Select **HolyC File Icons**.

> Note: VS Code only allows one active file icon theme at a time, and this theme only defines an
> icon for HolyC files — other files will show without icons while it's selected.

## How it works

The extension bundles the Emscripten-compiled `system/aiwnios.js` glue script and
`system/aiwnios.wasm` binary and loads them inside a VS Code Webview (a sandboxed Chromium
page), which provides the canvas/WebGL/audio/keyboard APIs the build needs. Nothing is executed
in the extension host or on Node.js — the WASM only ever runs inside the webview's browser
context.

## Development

```bash
code .   # then press F5 to launch an Extension Development Host
```

No build step is required — `extension.js` is loaded directly by VS Code.

To package a `.vsix`:

```bash
npx @vscode/vsce package
```

> Note: `system/aiwnios.wasm` is ~10 MB, so the packaged extension will be similarly sized.

## Credits

- [templeos.reiko.app](https://templeos.reiko.app/) — the aiwnios WebAssembly build of TempleOS.
- Languages support from [Sinjs' HolyC Language for VSCode](https://github.com/sinjs/holyc-vscode-language)
- Terry A. Davis — original creator of TempleOS.
