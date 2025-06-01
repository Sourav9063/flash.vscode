# Flash VSCode

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Acknowledgements](#acknowledgements)

## Overview

**flash.vscode(latest)** is the easiest way to have the best plugin of Neovim, [flash.nvim](https://github.com/folke/flash.nvim) in Visual Studio Code. Works with [VScodeWeb](https://vscode.dev)

**You Don't Need To Know VIM to Use Flash VSCode**

## Installation

1. Open Visual Studio Code.
2. Go to the Extensions view (`Ctrl+Shift+X` on Windows/Linux or `Cmd+Shift+X` on macOS).
3. Search for **Flash VSCode**.
4. Click **Install**.
5. Reload VS Code if prompted.

## Usage

### Tutorial

[Tutorial Video](https://github.com/user-attachments/assets/b4660aa8-dd2d-4c9f-9622-c01521747a76)

1. **Activate Navigation:**
   Flash VSCode provides two main functionalities:

   - **`flash-vscode.start`**: `alt+f` Moves the cursor directly to the selected target.
   - `alt+f` while some text is selected will search for the selected text.

     ![flash jump](https://github.com/user-attachments/assets/9a416efd-0927-4df8-b1f1-81d1582f328c)

   - Press `alt+f` or `alt+shift+f` then `<search>` then `enter` to goto next match, `shift+enter` to goto previous match.
   - Press `alt+f` or `alt+shift+f` then `enter` to search previously entered query.
   - Select text and press `alt+f` or `alt+shift+f` then `enter` to search and mark the selected text.
   - Press `alt+f` or `alt+shift+f` then `ctrl+enter` to mark all the variables in the current file.

     ![flash enter](https://github.com/user-attachments/assets/e2f932e3-73c6-4acd-9d8c-9937bb116821)

   - Press `alt+j` or `alt+k` to mark all the next line or previous line.
     | Next Line | Previous Line |
     | :--------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------: |
     | ![Screenshot (178)](https://github.com/user-attachments/assets/9281233c-2021-4a4a-9a8b-e5e0bdfa350c) | ![Screenshot (176)](https://github.com/user-attachments/assets/ef55f28b-3560-4884-a131-b2ac04ec9453) |

2. **Selection:**

   - **`flash-vscode.startSelection`**: `alt+shift+f` Extends the selection from the original position to the target.

     ![flash select](https://github.com/user-attachments/assets/e3a12392-3ab5-4ff7-a657-f28c4b09da2d)

3. **Cancel Navigation:**
   - Press `Backspace` to remove the last character of your query, or press `Escape` to exit jump mode.

## Configuration

### Case Sensitivity

By default, `flash-vscode`'s search is smart case insensitive. If any uppercase latter exists then becomes case sensitive. To change this behavior, add to your settings:

```json
{
  "flash-vscode.caseSensitive": false
}
```

### Appearance Customization

The following configuration options allow you to customize the visual appearance of Flash VSCode:

```json
{
  "flash-vscode.dimOpacity": "0.65",
  "flash-vscode.matchColor": "#3e68d7",
  "flash-vscode.matchFontWeight": "bold",
  "flash-vscode.labelColor": "#ffffff",
  "flash-vscode.labelBackgroundColor": "#ff007c",
  "flash-vscode.labelQuestionBackgroundColor": "#3E68D7",
  "flash-vscode.labelFontWeight": "bold",
  "flash-vscode.labelKeys": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:'\",.<>/?"
}
```

- `flash-vscode.dimOpacity`: Opacity used to dim text.
- `flash-vscode.matchColor`: Color used for matched text.
- `flash-vscode.matchFontWeight`: Font weight for matched text.
- `flash-vscode.labelColor`: Color used for label text.
- `flash-vscode.labelBackgroundColor`: Background color for labels.
- `flash-vscode.labelQuestionBackgroundColor`: Background color for question labels.
- `flash-vscode.labelFontWeight`: Font weight for label text.
- `flash-vscode.labelKeys`: Characters to use for labels.

### VSCodeVim Integration (Optional)

To invoke Flash VSCode commands from VSCodeVim, in your `settings.json`, add entries to `"vim.normalModeKeyBindingsNonRecursive"` as follows:

```json
"vim.normalModeKeyBindingsNonRecursive": [
  {
    "before": ["s"],
    "commands": ["flash-vscode.start"]
  },
  {
    "before": ["S"],
    "commands": ["flash-vscode.startSelection"]
  },
  {
    "before": [ "<BS>" ],
    "commands": [ "flash-vscode.backspace" ]
  },
]
```

This configuration triggers Flash VSCode when you press `s` or `S` in normal mode.

## Acknowledgements

- [flash.nvim](https://github.com/folke/flash.nvim) for the original ideas.
- [Jumpy2](https://marketplace.visualstudio.com/items?itemName=DavidLGoldberg.jumpy2) for some of the implementation details.
- [flash.vscode](https://github.com/cunbidun/flash.vscode) flash.vscode(latest) extension is supper set of this extension.
- [CVim-PR](https://github.com/VSCodeVim/Vim/issues/8567) [CVim](https://github.com/cuixiaorui/vscodeVim/tree/flash) for ux improvement ideas.
