import {App, MarkdownView, Notice} from 'obsidian';

/**
 * Utility function to navigate to a specific file and line in Obsidian
 */
export async function navigateToFile(app: App, filePath: string, lineNumber: number): Promise<boolean> {
	// Use Obsidian's workspace to open the file at specific line
	const file = app.vault.getAbstractFileByPath(filePath);
	if (!file) {
		new Notice(`File ${filePath} not found.`);
		return false;
	}

	await app.workspace.openLinkText(filePath, '', true);

	// Try to navigate to the specific line
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView) {
		const editor = activeView.editor;
		// Convert to 0-based line number for editor
		const targetLine = Math.max(0, lineNumber - 1);
		editor.setCursor(targetLine, 0);
		editor.scrollIntoView({from: {line: targetLine, ch: 0}, to: {line: targetLine, ch: 0}}, true);
	}

	return true;
}
