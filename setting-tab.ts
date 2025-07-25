import {App, Platform, PluginSettingTab, Setting} from 'obsidian';
import {DEFAULT_DECK} from './constants';
import type ObsidianAnkiPlugin from './main';

export class ObsidianAnkiSettingTab extends PluginSettingTab {
	plugin: ObsidianAnkiPlugin;

	constructor(app: App, plugin: ObsidianAnkiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// Mobile mode indicator
		if (Platform.isMobileApp) {
			const mobileInfo = containerEl.createEl('div', { cls: 'mobile-mode-info' });
			mobileInfo.style.padding = '10px';
			mobileInfo.style.marginBottom = '20px';
			mobileInfo.style.border = '1px solid var(--background-modifier-border)';
			mobileInfo.style.borderRadius = '6px';
			mobileInfo.style.backgroundColor = 'var(--background-secondary)';
			
			const mobileIcon = mobileInfo.createEl('span', { text: '📱 ' });
			mobileIcon.style.fontSize = '16px';
			
			const mobileText = mobileInfo.createEl('span', { 
				text: 'Mobile Mode: Syncing is disabled. Flashcard rendering and editing work with cached note types from desktop.'
			});
			mobileText.style.fontWeight = '500';
		}

		// Default Deck setting
		const deckSetting = new Setting(containerEl)
			.setName('Default Deck')
			.setDesc('The deck where new flashcards will be created in Anki');

		if (this.plugin.availableDecks && this.plugin.availableDecks.length > 0) {
			// Use dropdown when deck information is available
			deckSetting.addDropdown(dropdown => dropdown
				.addOptions(this.plugin.availableDecks.reduce((options, deck) => {
					options[deck] = deck;
					return options;
				}, {} as Record<string, string>))
				.setValue(this.plugin.settings.defaultDeck)
				.onChange(async (value) => {
					this.plugin.settings.defaultDeck = value;
					await this.plugin.saveSettings();
				}));
		} else {
			// Fallback to text input when no deck information is available
			deckSetting.addText(text => text
				.setPlaceholder(DEFAULT_DECK)
				.setValue(this.plugin.settings.defaultDeck)
				.onChange(async (value) => {
					this.plugin.settings.defaultDeck = value || DEFAULT_DECK;
					await this.plugin.saveSettings();
				}));
		}

		// Ignored Tags setting
		new Setting(containerEl)
			.setName('Ignored Tags')
			.setDesc('Tags to ignore during sync (comma-separated)')
			.addTextArea(text => {
				const textArea = text
					.setPlaceholder('marked, leech')
					.setValue(this.plugin.settings.ignoredTags.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.ignoredTags = value
							.split(',')
							.map(tag => tag.trim())
							.filter(tag => tag.length > 0);
						await this.plugin.saveSettings();
						// Update AnkiService with new ignored tags (only on desktop)
						if (!Platform.isMobileApp && this.plugin['ankiService']) {
							this.plugin['ankiService'].setIgnoredTags(this.plugin.settings.ignoredTags);
						}
					});
				
				// Add CSS class for styling
				textArea.inputEl.addClass('obsidian-anki-ignored-tags-input');
				
				return textArea;
			});

		// Available Note Types section
		const hasNoteTypes = this.plugin.settings.availableNoteTypes.length > 0;
		
		new Setting(containerEl)
			.setName('Anki Note Types')
			.setDesc(hasNoteTypes 
				? Platform.isMobileApp 
					? 'Cached note types from desktop for flashcard creation'
					: 'Note types saved from the last successful connection to Anki'
				: Platform.isMobileApp
					? 'No cached note types available. Sync from desktop first to enable flashcard creation.'
					: 'No note types cached yet')
			.addButton(button => button
				.setButtonText('Reset Cache')
				.setDisabled(!hasNoteTypes || Platform.isMobileApp)
				.onClick(async () => {
					this.plugin.settings.availableNoteTypes = [];
					await this.plugin.saveSettings();
					this.plugin['updateInsertFlashcardButtonState']();
					this.display();
				}));

		if (hasNoteTypes) {
			const noteTypesList = containerEl.createEl('div', { cls: 'cached-note-types-list' });
			noteTypesList.style.marginLeft = '20px';
			noteTypesList.style.marginTop = '10px';
			
			for (const noteType of this.plugin.settings.availableNoteTypes) {
				const noteTypeItem = noteTypesList.createEl('div', { cls: 'note-type-item' });
				noteTypeItem.style.marginBottom = '8px';
				
				const noteTypeName = noteTypeItem.createEl('strong', { text: noteType.name });
				noteTypeName.style.display = 'block';
				
				const fieldsText = noteTypeItem.createEl('small', { 
					text: `Fields: ${noteType.fields.join(', ')}`,
					cls: 'note-type-fields'
				});
				fieldsText.style.color = 'var(--text-muted)';
			}
		}
	}
}
