import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	// Decoration types for grey-out, highlight, and labels:
	const dimDecoration = vscode.window.createTextEditorDecorationType({
		color: 'rgba(128,128,128,0.5)'  // gray, semi-transparent to dim text
	});
	const matchDecoration = vscode.window.createTextEditorDecorationType({
		color: 'rgb(0,191,255)'  // blue text (for matched characters)
	});
	const labelDecoration = vscode.window.createTextEditorDecorationType({
		before: {
			backgroundColor: 'rgb(255,165,0)',
			fontWeight: 'bold'
		}
	});

	let active = false;
	let searchQuery = '';
	let isSelectionMode = false;

	// Map of label character to target position
	let labelMap: Map<string, { editor: vscode.TextEditor, position: vscode.Position }> = new Map();

	// Define the character pool for labels: lowercase, then uppercase, then digits
	const labelChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	// All alphanumeric characters and common punctuation keys for programmers
	const commandKey= 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:\'",.<>/`~\\';


	// Helper to update all editor decorations based on current query
	function updateHighlights() {
		if (!active) return;
		labelMap.clear();

		// If query is empty, simply grey out everything (no matches to highlight)
		if (searchQuery.length === 0) {
			// Grey-out all visible text
			for (const editor of vscode.window.visibleTextEditors) {
				if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
					continue;
				}
				// Apply dim decoration to full visible ranges of each editor
				editor.setDecorations(dimDecoration, editor.visibleRanges);
				editor.setDecorations(labelDecoration, []);
			}
			return;
		}
		else {
			for (const editor of vscode.window.visibleTextEditors) {
				if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
					continue;
				}
				editor.setDecorations(dimDecoration, []);
			}
		}

		// Not empty query: find matches in each visible editor
		interface LocationInfo { editor: vscode.TextEditor, range: vscode.Range, matchStart: vscode.Position }
		const allMatches: LocationInfo[] = [];
		const allLabels: LocationInfo[] = [];
		const allUnMatches: LocationInfo[] = [];
		let nextChars: string[] = [];

		for (const editor of vscode.window.visibleTextEditors) {
			if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
				continue;
			}
			const document = editor.document;
			for (const visibleRange of editor.visibleRanges) {
				const startLine = visibleRange.start.line;
				const endLine = visibleRange.end.line;
				// add some lines before and after the visible range to allUnMatches
				const startLineUnMatch = Math.max(0, startLine - 5);
				const endLineUnMatch = Math.min(document.lineCount - 1, endLine + 5);
				allUnMatches.push({
					editor,
					range: new vscode.Range(new vscode.Position(startLineUnMatch, 0), new vscode.Position(startLine, 0)),
					matchStart: new vscode.Position(startLineUnMatch, 0)
				});
				allUnMatches.push({
					editor,
					range: new vscode.Range(new vscode.Position(endLine + 1, 0), new vscode.Position(endLineUnMatch, 0)),
					matchStart: new vscode.Position(endLine, 0)
				});
				for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
					const lineText = document.lineAt(lineNum).text;
					// Search for all occurrences of searchQuery in this line (case-sensitive)
					let index = lineText.indexOf(searchQuery);
					let last_match_index = 0;
					while (index !== -1) {
						const matchStart = new vscode.Position(lineNum, index);
						const matchEnd = new vscode.Position(lineNum, index + searchQuery.length);
						// set nextChar to the character after the match, if it exists
						const nextChar = lineText[index + searchQuery.length];
						if (nextChar) {
							nextChars.push(nextChar);
						}
						allMatches.push({ editor, range: new vscode.Range(matchStart, matchEnd), matchStart: matchStart });
						const labelStart = new vscode.Position(lineNum, index + searchQuery.length);
						const labelEnd = new vscode.Position(lineNum, index + searchQuery.length + 1);
						allLabels.push({ editor, range: new vscode.Range(labelStart, labelEnd), matchStart: matchStart });
						// continue searching from just after this match start
						if (last_match_index < index) {
							allUnMatches.push({
								editor,
								range: new vscode.Range(new vscode.Position(lineNum, last_match_index), matchStart),
								matchStart: new vscode.Position(lineNum, index - 1)
							});
						}
						last_match_index = index + searchQuery.length;
						index = lineText.indexOf(searchQuery, index + 1);
					}
					if (last_match_index < lineText.length) {
						allUnMatches.push({
							editor,
							range: new vscode.Range(new vscode.Position(lineNum, last_match_index), new vscode.Position(lineNum, lineText.length)),
							matchStart: new vscode.Position(lineNum, lineText.length - 1)
						});
					}
				}
			}
		}

		// Decide how many (if any) to label:
		const totalMatches = allMatches.length;
		// deduplicate nextChars
		const allNextChars = [...new Set(nextChars)];
		// all characters that are in labelChars but not in allNextChars
		const useableLabelChars = labelChars.split('').filter(c => !allNextChars.includes(c));

		// create an label array with length equal to the number of matches, and fill it with the useableLabelChars
		// if there are more matches than useableLabelChars, then fill the array with the useableLabelChars and then
		// fill the rest with the question mark character
		const labelCharsToUse = totalMatches > useableLabelChars.length ?
			useableLabelChars.concat(Array(totalMatches - useableLabelChars.length).fill('?')) :
			useableLabelChars.slice(0, totalMatches);

		let charCounter = 0;

		for (const editor of vscode.window.visibleTextEditors) {
			if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
				continue;
			}
			const decorationOptions: vscode.DecorationOptions[] = [];
			editor.setDecorations(matchDecoration, allMatches.filter(m => m.editor === editor).map(m => m.range));
			editor.setDecorations(dimDecoration, allUnMatches.filter(m => m.editor === editor).map(m => m.range));
			// set the character before the match to the label character
			const ranges = allLabels.filter(m => m.editor === editor);
			for (let i = 0; i < ranges.length; i++) {
				let char = labelCharsToUse[charCounter];
				charCounter++;
				if (char !== '?') {
					labelMap.set(char, { editor: editor, position: ranges[i].matchStart });
				}
				decorationOptions.push({
					range: ranges[i].range,
					renderOptions: {
						before: { contentText: char }
					}
				});
			}
			editor.setDecorations(labelDecoration, decorationOptions);

		}
	}

	// Command to start navigation mode
	const _start = () => {
		if (active) return;
		active = true;
		searchQuery = '';
		labelMap.clear();
		// Set a context key for when-clause usage (for keybindings)
		vscode.commands.executeCommand('setContext', 'flash-vscode.active', true);
		// Initial highlight update (just grey out everything visible)
		updateHighlights();
	};

	const start = vscode.commands.registerCommand('flash-vscode.start', () => {
		isSelectionMode = false;
		_start();
	});

	const startSelection = vscode.commands.registerCommand('flash-vscode.startSelection', () => {
		isSelectionMode = true;
		_start();
	});

	// Exit navigation mode (clear decorations and reset state)
	const exit = vscode.commands.registerCommand('flash-vscode.exit', () => {
		if (!active) return;
		// Clear all decorations
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(dimDecoration, []);
			editor.setDecorations(matchDecoration, []);
			editor.setDecorations(labelDecoration, []);
		}
		active = false;
		searchQuery = '';
		labelMap.clear();
		vscode.commands.executeCommand('setContext', 'flash-vscode.active', false);
	});

	// Handle backspace: remove last character of query
	const backspaceHandler = vscode.commands.registerCommand('flash-vscode.backspace', () => {
		if (!active) return;
		if (searchQuery.length > 0) {
			searchQuery = searchQuery.slice(0, -1);
			updateHighlights();
		} else {
			// If query is empty, exit navigation (nothing to delete)
			vscode.commands.executeCommand('flash-vscode.exit');
		}
	});

	const jump = (target: { editor: vscode.TextEditor, position: vscode.Position }) => {
		const targetEditor = target.editor;
		const targetPos = target.position;
		targetEditor.selection = new vscode.Selection(isSelectionMode ? targetEditor.selection.anchor : targetPos, targetPos);
		targetEditor.revealRange(new vscode.Range(targetPos, targetPos));
		// If the target is in a different editor, focus that editor
		if (vscode.window.activeTextEditor !== targetEditor) {
			vscode.window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
		}
	}

	// Override the 'type' command to capture alphanumeric/symbol keys while in nav mode
	const handleInput = (chr: string) => {
		const text = chr;
		if (!text) {
			return; // nothing to handle
		}
		// If in navigation mode:
		// Check if this key corresponds to an active jump label
		if (labelMap.size > 0 && text.length === 1 && labelMap.has(text)) {
			// We have a label matching this key – perform the jump
			const target = labelMap.get(text)!;
			jump(target);
			// Exit navigation mode after jumping
			vscode.commands.executeCommand('flash-vscode.exit');
			return;
		}

		// If not a jump label (or no labels yet), treat it as part of the search query
		if (text === ' ' || text.length !== 1) {
			// (Optionally ignore space or multi-char input in this mode)
			return;
		}
		// Append typed character to the search query
		searchQuery += text;
		updateHighlights();
	};

	// Listen to editor scroll/visible range changes to update highlights in real-time
	const visChange = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		if (active) {
			// Recompute highlights (this will use the same searchQuery)
			updateHighlights();
		}
	});

	context.subscriptions.push(start, startSelection, exit, backspaceHandler, visChange,
		...[...commandKey].map(c => vscode.commands.registerCommand(`flash-vscode.jump.${c}`, () => handleInput(c)))
	);
}

export function deactivate() {
	// Clean up if needed (usually not much to do here for this extension)
}
