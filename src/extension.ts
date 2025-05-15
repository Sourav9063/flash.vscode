import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	// Decoration types for grey-out, highlight, and labels:
	const config = vscode.workspace.getConfiguration('flash-vscode');
	const dimColor = config.get<string>('dimColor', 'rgba(128, 128, 128, 0.6)');
	const matchColor = config.get<string>('matchColor', '#3e68d7');
	const matchFontWeight = config.get<string>('matchFontWeight', 'bold');
	const labelColor = config.get<string>('labelColor', '#c8c6eb');
	const labelBackgroundColor = config.get<string>('labelBackgroundColor', '#ff007c99');
	const labelQuestionBackgroundColor = config.get<string>('labelQuestionBackgroundColor', '#3E68D799');
	const labelFontWeight = config.get<string>('labelFontWeight', 'bold');
	// Define the character pool for labels: lowercase, then uppercase, then digits
	const labelChars = config.get<string>('labelKeys', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:\'",.<>/`~\\');

	const dimDecoration = vscode.window.createTextEditorDecorationType({
		color: dimColor
	});
	const matchDecoration = vscode.window.createTextEditorDecorationType({
		color: matchColor,
		fontWeight: matchFontWeight,
	});
	const labelDecoration = vscode.window.createTextEditorDecorationType({
		before: {
			color: labelColor,
			backgroundColor: labelBackgroundColor,
			fontWeight: labelFontWeight,
			textDecoration: `none; z-index: 1; position: absolute;`,
		}
	});
	const labelDecorationQuestion = vscode.window.createTextEditorDecorationType({
		before: {
			color: labelColor,
			backgroundColor: labelQuestionBackgroundColor,
			contentText: '?',
			fontWeight: labelFontWeight,
			textDecoration: `none; z-index: 1; position: absolute;`,
		}
	});

	let active = false;
	let searchQuery = '';
	let prevSearchQuery = '';
	let isSelectionMode = false;

	// Not empty query: find matches in each visible editor
	interface LocationInfo { editor: vscode.TextEditor, range: vscode.Range, matchStart: vscode.Position }
	let allMatches: LocationInfo[] = [];
	let allLabels: LocationInfo[] = [];

	// Map of label character to target position
	let labelMap: Map<string, { editor: vscode.TextEditor, position: vscode.Position }> = new Map();

	const searchChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~`!@#$%^&*()-_=+[]{}|\\;:\'",.<>/?';

	const unMatchLine = 10;

	// Helper to update all editor decorations based on current query
	function updateHighlights() {
		if (!active) {
			return;
		};

		const config = vscode.workspace.getConfiguration('flash-vscode');
		const caseSensitive = config.get<boolean>('caseSensitive', false);

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
				editor.setDecorations(labelDecorationQuestion, []);
			}
			return;
		}
		// show the search query in the status bar
		vscode.window.setStatusBarMessage(`flash: ${searchQuery}`);
		labelMap.clear();
		// for (const editor of vscode.window.visibleTextEditors) {
		// 	if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
		// 		continue;
		// 	}
		// 	editor.setDecorations(dimDecoration, []);
		// }

		// Not empty query: find matches in each visible editor
		allMatches = [];
		allLabels = [];
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
				const startLineUnMatch = Math.max(0, startLine - unMatchLine);
				const endLineUnMatch = Math.min(document.lineCount - 1, endLine + unMatchLine);
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
					let textToSearch = lineText;
					let queryToSearch = searchQuery;
					//if searchQuery contains any uppercase letter the caseSensitivity is ignored
					if (searchQuery.toLowerCase() !== searchQuery || caseSensitive) {
						textToSearch = lineText;
						queryToSearch = searchQuery;
					}
					else {
						textToSearch = lineText.toLowerCase();
						queryToSearch = searchQuery.toLowerCase();
					}
					// Search for all occurrences of queryToSearch in this line 
					let index = textToSearch.indexOf(queryToSearch);
					let last_match_index = 0;
					while (index !== -1) {
						const matchStart = new vscode.Position(lineNum, index);
						const matchEnd = new vscode.Position(lineNum, index + queryToSearch.length);
						// set nextChar to the character after the match, if it exists
						const nextChar = lineText[ index + queryToSearch.length ];
						if (nextChar) {
							nextChars.push(nextChar);
						}
						allMatches.push({ editor, range: new vscode.Range(matchStart, matchEnd), matchStart: matchStart });
						const labelStart = new vscode.Position(lineNum, index + queryToSearch.length);
						const labelEnd = new vscode.Position(lineNum, index + queryToSearch.length + 1);
						allLabels.push({ editor, range: new vscode.Range(labelStart, labelEnd), matchStart: matchStart });
						// continue searching from just after this match start
						if (last_match_index < index) {
							allUnMatches.push({
								editor,
								range: new vscode.Range(new vscode.Position(lineNum, last_match_index), matchStart),
								matchStart: new vscode.Position(lineNum, index - 1)
							});
						}
						last_match_index = index + queryToSearch.length;
						index = textToSearch.indexOf(queryToSearch, index + 1);
					}
					if (last_match_index < textToSearch.length) {
						allUnMatches.push({
							editor,
							range: new vscode.Range(new vscode.Position(lineNum, last_match_index), new vscode.Position(lineNum, textToSearch.length)),
							matchStart: new vscode.Position(lineNum, textToSearch.length - 1)
						});
					}
				}
			}
		}

		const activeEditor = vscode.window.activeTextEditor;
		const distanceOffset = 4;
		if (activeEditor) {
			const cursorPos = activeEditor.selection.active;
			// Helper function to compute Euclidean distance between two positions.
			function getDistance(pos1: vscode.Position, pos2: vscode.Position): number {
				const lineDiff = pos1.line - pos2.line;
				const charDiff = pos1.character - pos2.character;
				return lineDiff * lineDiff * 1000 + charDiff * charDiff + distanceOffset;
			}

			// Sort the matches by distance from the cursor.
			allLabels.sort((a, b) => {
				let weight_a = 1;
				let weight_b = 1;
				if (a.editor !== activeEditor) {
					weight_a = 10000;
				}
				if (b.editor !== activeEditor) {
					weight_b = 10000;
				}

				const distanceA = getDistance(cursorPos, a.matchStart) * weight_a;
				const distanceB = getDistance(cursorPos, b.matchStart) * weight_b;
				return distanceA - distanceB;
			});

			allLabels = allLabels.filter(a => {
				return getDistance(cursorPos, a.matchStart) > distanceOffset;
			});
		}
		// Decide how many (if any) to label:
		const totalMatches = allMatches.length;
		// deduplicate nextChars
		const allNextChars = [ ...new Set(nextChars) ];
		// all characters that are in labelChars but not in allNextChars
		const useableLabelChars = labelChars.split('').filter(c => !allNextChars.includes(c));

		// create an label array with length equal to the number of matches, and fill it with the useableLabelChars
		// if there are more matches than useableLabelChars, then fill the array with the useableLabelChars and then
		// fill the rest with the question mark character
		const labelCharsToUse = totalMatches > useableLabelChars.length ?
			useableLabelChars.concat(Array(totalMatches - useableLabelChars.length).fill('?')) :
			useableLabelChars.slice(0, totalMatches);

		let charCounter = 0;

		let visibleEditors = vscode.window.visibleTextEditors;
		// move the active editor to the front of the array
		if (activeEditor) {
			visibleEditors = [ activeEditor, ...vscode.window.visibleTextEditors.filter(e => e !== activeEditor) ];
		}

		for (const editor of visibleEditors) {
			const decorationOptions: vscode.DecorationOptions[] = [];
			const questionDecorationOptions: vscode.DecorationOptions[] = [];
			editor.setDecorations(matchDecoration, allMatches.filter(m => m.editor === editor).map(m => m.range));
			editor.setDecorations(dimDecoration, allUnMatches.filter(m => m.editor === editor).map(m => m.range));
			// set the character before the match to the label character
			const ranges = allLabels.filter(m => m.editor === editor);
			for (let i = 0; i < ranges.length; i++) {
				const labelRange = ranges[ i ].range.with(new vscode.Position(ranges[ i ].range.start.line, ranges[ i ].range.start.character - searchQuery.length));
				let char = labelCharsToUse[ charCounter ];
				charCounter++;
				if (char !== '?') {
					labelMap.set(char, { editor: editor, position: ranges[ i ].matchStart });
					decorationOptions.push({
						range: labelRange,
						renderOptions: {
							before: { contentText: char }
						}
					});
				}
				else {
					questionDecorationOptions.push({
						range: labelRange,
						renderOptions: {
							before: { contentText: '?' }
						}
					});
				}
			}
			editor.setDecorations(labelDecoration, decorationOptions);
			editor.setDecorations(labelDecorationQuestion, questionDecorationOptions);
			if (isSelectionMode) {
				break;
			}

		}
	}

	// Command to start navigation mode
	const _start = () => {
		if (active) { return; };
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
		if (!active) { return; };
		// Clear all decorations
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(dimDecoration, []);
			editor.setDecorations(matchDecoration, []);
			editor.setDecorations(labelDecoration, []);
			editor.setDecorations(labelDecorationQuestion, []);
		}
		active = false;
		prevSearchQuery = searchQuery;
		searchQuery = '';
		labelMap.clear();
		vscode.commands.executeCommand('setContext', 'flash-vscode.active', false);
		vscode.window.setStatusBarMessage('');
	});

	// Handle backspace: remove last character of query
	const backspaceHandler = vscode.commands.registerCommand('flash-vscode.backspace', () => {
		if (!active) { return; };
		if (searchQuery.length > 0) {
			searchQuery = searchQuery.slice(0, -1);
			updateHighlights();
		} else {
			// If query is empty, exit navigation (nothing to delete)
			vscode.commands.executeCommand('flash-vscode.exit');
		}
	});

	const jump = (target: { editor: vscode.TextEditor, position: vscode.Position }, scroll: boolean = false) => {
		const targetEditor = target.editor;
		const targetPos = target.position;
		targetEditor.selection = new vscode.Selection(isSelectionMode ? targetEditor.selection.anchor : targetPos, targetPos);
		targetEditor.revealRange(new vscode.Range(targetPos, targetPos), scroll ? vscode.TextEditorRevealType.InCenter : vscode.TextEditorRevealType.Default);
		// If the target is in a different editor, focus that editor
		if (vscode.window.activeTextEditor !== targetEditor) {
			vscode.window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
		}
	};

	// Override the 'type' command to capture alphanumeric/symbol keys while in nav mode
	const handleInput = (chr: string) => {
		if (chr === 'space') {
			chr = ' ';
		}

		const text = chr;
		if (!text) {
			return; // nothing to handle
		}

		if (chr === 'enter' || chr === 'shiftEnter') {
			if (searchQuery.length === 0) {
				searchQuery = prevSearchQuery;
				updateHighlights();
				return;
			}
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const cursorPos = activeEditor.selection.active;
				const cursorPosValue = cursorPos.line * 1000 + cursorPos.character;
				const values = allMatches;
				let target0;
				let posMax = Number.MAX_SAFE_INTEGER;
				let posMin = Number.MIN_SAFE_INTEGER;
				let target1;
				for (const value of values) {
					if (value.editor !== activeEditor) {
						continue;
					}
					const posValue = value.matchStart.line * 1000 + value.matchStart.character - cursorPosValue;
					if (posValue > 0 && posValue < posMax) {
						posMax = posValue;
						target0 = value;
					}
					else if (posValue < 0 && posValue > posMin) {
						posMin = posValue;
						target1 = value;
					}

				}
				const target = chr === 'enter' ? target0 : target1;
				if (target) {
					jump({ editor: target.editor, position: target.matchStart }, true);
					updateHighlights();
				}
			}
			return;
		}

		// If in navigation mode:
		// Check if this key corresponds to an active jump label
		if (labelMap.size > 0 && labelMap.has(text)) {
			// We have a label matching this key – perform the jump
			const target = labelMap.get(text)!;
			jump(target);
			// Exit navigation mode after jumping
			vscode.commands.executeCommand('flash-vscode.exit');
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
	const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('flash-vscode.caseInsensitive')) {
			updateHighlights();
		}
	});

	let allChars = searchChars.split('').concat([ 'space', 'enter', 'shiftEnter' ]);
	context.subscriptions.push(configChangeListener, start, startSelection, exit, backspaceHandler, visChange,
		...allChars.map(c => vscode.commands.registerCommand(`flash-vscode.jump.${c}`, () => handleInput(c)))
	);
}

export function deactivate() {
	// Clean up if needed (usually not much to do here for this extension)
}
