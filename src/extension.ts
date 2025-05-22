import * as vscode from 'vscode';
const flashVscodeModes = { idle: 'idle', active: 'active', lineUp: 'lineUp', lineDown: 'lineDown', symbol: 'symbol', selection: 'selection', };
const flashVscodeModeKey = 'flash-vscode-mode';
let flashVscodeMode: string = flashVscodeModes.idle;

const updateFlashVscodeMode = (mode: string) => {
	flashVscodeMode = mode;
	vscode.commands.executeCommand('setContext', flashVscodeModeKey, flashVscodeMode);
};
export function activate(context: vscode.ExtensionContext) {
	// Decoration types for grey-out, highlight, and labels:
	updateFlashVscodeMode(flashVscodeModes.idle);
	let config: vscode.WorkspaceConfiguration;
	let dimDecoration: vscode.TextEditorDecorationType;
	let matchDecoration: vscode.TextEditorDecorationType;
	let labelDecoration: vscode.TextEditorDecorationType;
	let labelDecorationQuestion: vscode.TextEditorDecorationType;

	let dimColor: string;
	let matchColor: string;
	let matchFontWeight: string;
	let labelColor: string;
	let labelBackgroundColor: string;
	let labelQuestionBackgroundColor: string;
	let labelFontWeight: string;
	let labelChars: string;
	let caseSensitive: boolean;

	const getConfiguration = () => {
		config = vscode.workspace.getConfiguration('flash-vscode');
		dimColor = config.get<string>('dimColor', 'rgba(128, 128, 128, 0.6)');
		matchColor = config.get<string>('matchColor', '#3e68d7');
		matchFontWeight = config.get<string>('matchFontWeight', 'bold');
		labelColor = config.get<string>('labelColor', '#c8c6eb');
		labelBackgroundColor = config.get<string>('labelBackgroundColor', '#ff007c99');
		labelQuestionBackgroundColor = config.get<string>('labelQuestionBackgroundColor', '#3E68D799');
		labelFontWeight = config.get<string>('labelFontWeight', 'bold');
		// Define the character pool for labels: lowercase, then uppercase, then digits
		labelChars = config.get<string>('labelKeys', 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:\'",.<>/`~\\');
		caseSensitive = config.get<boolean>('caseSensitive', false);

		dimDecoration = vscode.window.createTextEditorDecorationType({
			color: dimColor
		});
		matchDecoration = vscode.window.createTextEditorDecorationType({
			color: matchColor,
			backgroundColor: `${matchColor}70`,
			fontWeight: matchFontWeight,
			textDecoration: `none; z-index: 1; color: ${matchColor} !important;`,
		});
		labelDecoration = vscode.window.createTextEditorDecorationType({
			before: {
				color: labelColor,
				backgroundColor: labelBackgroundColor,
				fontWeight: labelFontWeight,
				textDecoration: `none; z-index: 1; position: absolute;`,
			}
		});
		labelDecorationQuestion = vscode.window.createTextEditorDecorationType({
			before: {
				color: labelColor,
				backgroundColor: labelQuestionBackgroundColor,
				contentText: '?',
				fontWeight: labelFontWeight,
				textDecoration: `none; z-index: 1; position: absolute;`,
			}
		});

	};
	getConfiguration();

	function throttle(func: Function, delay: number) {
		let timeoutId: NodeJS.Timeout | null = null;
		let lastArgs: any[] | null = null;
		let lastThis: any = null;

		const throttled = function (...args: any[]) {
			lastArgs = args;
			lastThis = this;

			if (!timeoutId) {
				timeoutId = setTimeout(() => {
					func.apply(lastThis, lastArgs);
					timeoutId = null;
					lastArgs = null;
					lastThis = null;
				}, delay);
			}
		};

		// Add a cancel method to clear any pending execution
		throttled.cancel = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
				lastArgs = null;
				lastThis = null;
			}
		};

		return throttled;
	}

	let active = false;
	let searchQuery = '';
	let prevSearchQuery = '';
	let isSymbolMode = false; // State to indicate if we are in symbol/outline mode
	let symbols: vscode.DocumentSymbol[] = [];

	// Map of label character to target position
	let labelMap: Map<string, { editor: vscode.TextEditor, position: vscode.Position }> = new Map();

	interface LocationInfo { editor: vscode.TextEditor, range: vscode.Range, matchStart: vscode.Position, relativeDis: number }
	let allMatches: LocationInfo[] = [];
	let allMatchSortByRelativeDis: LocationInfo[] | undefined;
	let nextMatchIndex: number | undefined;

	const searchChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789~`!@#$%^&*()-_=+[]{}|\\;:\'",.<>/?';

	async function getOutlineRangesForVisibleEditors(editor: vscode.TextEditor) {

		const document = editor.document;
		const documentUri = document.uri;

		try {
			symbols = symbols.length === 0 ? symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
				'vscode.executeDocumentSymbolProvider',
				documentUri
			) : symbols;

			if (symbols) {
				itrSymbol(symbols, editor);
			} else {
			}

		} catch (error) {
		}
	}

	function itrSymbol(symbols: vscode.DocumentSymbol[], editor: vscode.TextEditor) {
		for (const symbol of symbols) {
			const range = symbol.range;
			allMatches.push({ editor, range: new vscode.Range(range.start, new vscode.Position(range.start.line, range.start.character + symbol.name.length)), matchStart: range.start, relativeDis: relativeVsCodePosition(range.start) });
			if (symbol.children.length > 0) {
				itrSymbol(symbol.children, editor);
			}
		}
	}

	function relativeVsCodePosition(pos: vscode.Position) {
		return pos.line * 1000 + pos.character;
	}

	// Example usage: Call this function to get outline ranges for all visible editors

	// Helper to update all editor decorations based on current query
	async function updateHighlights() {
		if (!active) {
			return;
		};

		if (searchQuery.toLowerCase() !== searchQuery) {
			caseSensitive = true;
		} else {
			caseSensitive = config.get<boolean>('caseSensitive', false);
		}
		// show the search query or mode in the status bar
		vscode.window.setStatusBarMessage(searchQuery.length > 0 ? `flash: ${isSymbolMode ? 'Symbol' : searchQuery}` : '');
		labelMap.clear();
		// for (const editor of vscode.window.visibleTextEditors) {
		// 	if (isSelectionMode && editor !== vscode.window.activeTextEditor) {
		// 		continue;
		// 	}
		// 	editor.setDecorations(dimDecoration, []);
		// }

		// Not empty query: find matches in each visible editor
		allMatches = [];
		let nextChars: string[] = [];

		for (const editor of vscode.window.visibleTextEditors) {
			if ([ flashVscodeModes.symbol, flashVscodeModes.selection, flashVscodeModes.lineDown, flashVscodeModes.lineUp ].includes(flashVscodeMode) && editor !== vscode.window.activeTextEditor) {
				continue;
			}
			const isActiveEditor = editor === vscode.window.activeTextEditor;
			editor.setDecorations(dimDecoration, editor.visibleRanges);
			if (searchQuery.length === 0) {
				editor.setDecorations(labelDecoration, []);
				editor.setDecorations(labelDecorationQuestion, []);
				if (!isSymbolMode && flashVscodeMode !== flashVscodeModes.lineDown && flashVscodeMode !== flashVscodeModes.lineUp) {
					continue;
				}
			}
			const document = editor.document;

			if (isSymbolMode) {
				try {
					await getOutlineRangesForVisibleEditors(editor);
				} catch (error) {
				}
			}
			else if (flashVscodeMode === flashVscodeModes.lineDown || flashVscodeMode === flashVscodeModes.lineUp) {

				const currentLine = editor.selection.active.line;
				const itr = flashVscodeMode === flashVscodeModes.lineDown ? 1 : -1;

				for (let i = 0; i < labelChars.length; i++) {
					const matchStart = new vscode.Position(currentLine + itr * i, 0);
					allMatches.push({ editor, range: new vscode.Range(matchStart, matchStart), matchStart: matchStart, relativeDis: relativeVsCodePosition(matchStart) });
				}

			}
			else {
				// Existing text search logic
				for (const visibleRange of editor.visibleRanges) {
					const startLine = isActiveEditor ? 0 : visibleRange.start.line;
					const endLine = isActiveEditor ? document.lineCount - 1 : visibleRange.end.line;
					for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
						const lineText = document.lineAt(lineNum).text;
						let textToSearch = lineText;
						let queryToSearch = searchQuery;
						//if searchQuery contains any uppercase letter the caseSensitivity is ignored
						if (caseSensitive) {
							textToSearch = lineText;
							queryToSearch = searchQuery;
						}
						else {
							textToSearch = lineText.toLowerCase();
							queryToSearch = searchQuery.toLowerCase();
						}
						// Search for all occurrences of queryToSearch in this line
						let index = textToSearch.indexOf(queryToSearch);
						while (index !== -1) {
							const matchStart = new vscode.Position(lineNum, index);
							const matchEnd = new vscode.Position(lineNum, index + queryToSearch.length);
							// set nextChar to the character after the match, if it exists
							const nextChar = lineText[ index + queryToSearch.length ];
							if (nextChar) {
								nextChars.push(nextChar);
								if (queryToSearch) {
									nextChars.push(nextChar.toLowerCase());
								}
							}
							allMatches.push({ editor, range: new vscode.Range(matchStart, matchEnd), matchStart: matchStart, relativeDis: relativeVsCodePosition(matchStart) });
							index = textToSearch.indexOf(queryToSearch, index + 1);
						}
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
			allMatches.sort((a, b) => {
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
			if (allMatches.length > 0) {
				const label = allMatches[ 0 ];
				if (getDistance(cursorPos, label.matchStart) === distanceOffset) {
					allMatches.shift();
				}
			}

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
			// set the character before the match to the label character
			for (const match of allMatches) {
				if (match.editor !== editor) { continue; }
				const labelRange = match.range;
				let char = labelCharsToUse[ charCounter ];
				charCounter++;
				if (char !== '?') {
					labelMap.set(char, { editor: editor, position: match.matchStart });
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

			if (flashVscodeMode === flashVscodeModes.selection) {
				break;
			}
		}
	}

	// Command to start navigation mode
	const _start = () => {
		if (active) { return; };
		active = true;
		searchQuery = '';
		isSymbolMode = false; // Ensure symbol mode is off by default on start
		labelMap.clear();
		symbols = [];
		// Set a context key for when-clause usage (for keybindings)
		vscode.commands.executeCommand('setContext', 'flash-vscode.active', true);
		// Initial highlight update (just grey out everything visible)
		updateHighlights();
	};

	const start = vscode.commands.registerCommand('flash-vscode.start', () => {
		updateFlashVscodeMode(flashVscodeModes.active);
		_start();
	});

	const startSelection = vscode.commands.registerCommand('flash-vscode.startSelection', () => {
		updateFlashVscodeMode(flashVscodeModes.selection);
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
		isSymbolMode = false;
		allMatchSortByRelativeDis = undefined;
		nextMatchIndex = undefined;
		labelMap.clear();
		vscode.commands.executeCommand('setContext', 'flash-vscode.active', false);
		flashVscodeMode = flashVscodeModes.idle;
		vscode.commands.executeCommand('setContext', flashVscodeModeKey, flashVscodeMode);
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
		const selectFrom = flashVscodeMode === flashVscodeModes.selection ? targetEditor.selection.anchor : targetPos;
		const isForward = targetEditor.selection.anchor.isBefore(targetPos);
		const selectTo = flashVscodeMode === flashVscodeModes.selection ? new vscode.Position(targetPos.line, targetPos.character + (isForward ? 1 : 0)) : targetPos;
		targetEditor.selection = new vscode.Selection(selectFrom, selectTo);
		targetEditor.revealRange(new vscode.Range(targetPos, targetPos), scroll ? vscode.TextEditorRevealType.InCenter : vscode.TextEditorRevealType.Default);
		// If the target is in a different editor, focus that editor
		if (vscode.window.activeTextEditor !== targetEditor) {
			vscode.window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
		}
	};

	const handleEnterOrShiftEnter = (chr: string) => {
		if (searchQuery.length === 0) {
			searchQuery = prevSearchQuery;
			updateHighlights();
		}
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && allMatches.length > 0) {
			const cursorPos = activeEditor.selection.active;
			let target: LocationInfo | undefined;
			const curPos = relativeVsCodePosition(cursorPos);
			if (allMatchSortByRelativeDis === undefined) {
				allMatchSortByRelativeDis = allMatches.filter(m => m.editor === activeEditor).sort((a, b) => a.relativeDis - b.relativeDis);
			}
			if (chr === 'shiftEnter') {
				nextMatchIndex = nextMatchIndex !== undefined ? nextMatchIndex - 1 : allMatchSortByRelativeDis.findIndex(m => m.relativeDis > curPos);
				if (nextMatchIndex < 0) {
					nextMatchIndex = allMatchSortByRelativeDis.length - 1;
				}
			}
			else {
				nextMatchIndex = nextMatchIndex !== undefined ? nextMatchIndex + 1 : allMatchSortByRelativeDis.findIndex(m => m.relativeDis > curPos);
				if (nextMatchIndex! >= allMatchSortByRelativeDis.length) {
					nextMatchIndex = 0;
				}
			}
			target = allMatchSortByRelativeDis[ nextMatchIndex! ];
			if (target) {
				jump({ editor: target.editor, position: target.matchStart }, true);
				updateHighlights();
			} else {
				vscode.window.showWarningMessage(chr === "enter" ? "No forward match found" : "No backward match found");
			}
		}
		else {
			vscode.window.showWarningMessage("No match found");
		}
		return;
	};

	const throttledHandleEnterOrShiftEnter = throttle(handleEnterOrShiftEnter, 70);
	// const throttledHandleEnterOrShiftEnter250 = throttle(handleEnterOrShiftEnter, 250);

	// Override the 'type' command to capture alphanumeric/symbol keys while in nav mode
	const handleInput = (chr: string) => {
		if (chr === 'space') {
			chr = ' ';
		}

		const text = chr;
		if (!text) {
			return; // nothing to handle
		}

		switch (chr) {
			case 'symbol':
				isSymbolMode = true;
				searchQuery = '';
				updateHighlights();
				return;
			case 'lineUp':
				updateFlashVscodeMode(flashVscodeModes.lineUp);
				searchQuery = '';
				updateHighlights();
				return;
			case 'lineDown':
				updateFlashVscodeMode(flashVscodeModes.lineDown);
				searchQuery = '';
				updateHighlights();
				return;
			case 'enter':
			case 'shiftEnter':
				throttledHandleEnterOrShiftEnter(chr);
				return;
			default:
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
				// throttledHandleEnterOrShiftEnter250();
				updateHighlights();
		}

	};

	// Listen to editor scroll/visible range changes to update highlights in real-time
	const visChange = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
		if (active) {
			// Recompute highlights (this will use the same searchQuery)
			updateHighlights();
		}
	});
	const configChangeListener = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('flash-vscode')) {
			getConfiguration();
			updateHighlights();
		}
	});

	let allChars = searchChars.split('').concat([ 'space', 'enter', 'shiftEnter', 'symbol', 'lineDown', 'lineUp' ]);
	context.subscriptions.push(configChangeListener, start, startSelection, exit, backspaceHandler, visChange,
		...allChars.map(c => vscode.commands.registerCommand(`flash-vscode.jump.${c}`, () => handleInput(c)))
	);
}

export function deactivate() {
	// Clean up if needed (usually not much to do here for this extension)
}
