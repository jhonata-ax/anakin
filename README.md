# Format Painter BR — RemNote Plugin

**Version:** 2.0.0  
**Repository:** https://github.com/jhonata-ax/anakin  
**Plugin ID:** `format_painter_br`

Format Painter BR lets you copy formatting from selected text in RemNote and apply those styles to a different selection without intentionally changing its wording. It is designed for the RemNote editor and provides a compact, draggable, collapsible toolbar.

## Features

- Copy and apply supported text styles, including **bold**, *italic*, underline, text color, and highlight.
- Preserve custom color values when the RemNote plugin API exposes and accepts them.
- Work with a selected text range instead of searching for all occurrences of the same word.
- Draggable toolbar with a compact/reopen mode.
- Commands for copying, applying, showing/hiding the toolbar, and diagnostics.
- Checks intended to avoid selecting an ambiguous text occurrence or replacing the destination wording.

### Usage

1. Select formatted text in a RemNote editor.
2. Click **Copy** in the Format Painter toolbar (or use the `fpc` command).
3. Select the destination text.
4. Click **Apply** (or use `fpa`).

The toolbar handle can be dragged. Double-click the handle to collapse or expand the toolbar.

### Available commands

| Code | Action |
| --- | --- |
| `fpc` | Copy formatting |
| `fpa` | Apply formatting |
| `fpb` | Show toolbar |
| `fph` | Hide toolbar |
| `fpr` | Reset toolbar position |
| `fpx` | Diagnose current selection |
| `fpd` | Diagnose text-color attributes |
| `fpo` | Open the current review card in the regular editor |

## Build from source

Prerequisites: Node.js and npm. Use a compatible LTS release and a Git client to manage the repository.

```bash
npm ci
npm test
npm run build
```

The production build produces `PluginZip.zip` at the project root. This is the file to upload through **RemNote → Settings → Plugins → Build → Upload plugin**.

For local development:

```bash
npm ci
npm run dev
```

In RemNote, select **Plugins → Build → Develop from localhost** and connect to the URL shown in the terminal (normally `http://localhost:8080`).

### Version correspondence

The source code and `public/manifest.json` in this repository correspond to **2.0.0**, not to the earlier **0.2.0** submission. To review this revision, build and upload `PluginZip.zip` from this same source revision.

The manifest declares `repoUrl` as `https://github.com/jhonata-ax/anakin`.

## Permissions and privacy

The plugin requests the `All / ReadCreateModifyDelete` RemNote scope because applying text formatting requires write access. This is a broad scope. The plugin reads the active text selection and stores the copied style in local plugin storage. Its diagnostics may show style metadata and selected-text previews inside the app. The toolbar icon points to an externally hosted Twemoji image on `raw.githubusercontent.com`.

The source currently contains no explicit network requests that send note contents to a third-party API. Reviewers should inspect the code and its dependencies independently before approving it.

## Known limitations

- Some review-queue editing contexts may not expose a usable text selection through the plugin SDK.
- RichText attributes from newer RemNote features, particularly custom colors, may not always be accepted by the legacy SDK used for this version.
- The plugin may cancel a formatting operation if it cannot verify the selected destination unambiguously.
- Automated tests exercise the local logic but do not replace integration testing in the RemNote web and desktop clients.

## Source structure

- `src/`: TypeScript/React plugin implementation
- `public/manifest.json`: marketplace manifest, including version and repository URL
- `webpack.config.cjs`: development and production bundling
- `tests/`: automated tests (`npm test`)
- `package.json` and `package-lock.json`: dependencies and reproducible build inputs

## Review and issue reporting

Please report issues or questions at: https://github.com/jhonata-ax/anakin/issues

This repository is provided to allow public source review of the RemNote plugin submitted to the Marketplace.
