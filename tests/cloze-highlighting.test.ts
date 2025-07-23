import {ClozeHighlighter} from '../cloze-highlighting';

describe('Cloze Highlighting Logic', () => {
	describe('ClozeHighlighter.highlightClozes', () => {
		it('should not affect regular text without cloze patterns', () => {
			const text = 'This is regular text without any cloze deletions.';

			const highlighted = ClozeHighlighter.highlightClozes(text);

			expect(highlighted).toBe(text);
		});

		it('should convert simple cloze deletions to HTML spans with color classes', () => {
			const text = 'The capital of France is {{c1::Paris}} and it has {{c2::2.2 million}} inhabitants.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'The capital of France is <span class="cloze-deletion cloze-1" data-cloze=1>Paris</span> and it has <span class="cloze-deletion cloze-2" data-cloze=2>2.2 million</span> inhabitants.'
			);
		});

		it('should handle multiple instances of same cloze number', () => {
			const text = 'The {{c1::mitochondria}} is the {{c2::powerhouse}} of the {{c1::cell}}.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'The <span class="cloze-deletion cloze-1" data-cloze=1>mitochondria</span> is the <span class="cloze-deletion cloze-2" data-cloze=2>powerhouse</span> of the <span class="cloze-deletion cloze-1" data-cloze=1>cell</span>.'
			);
		});

		it('should handle cloze deletions with hints', () => {
			const text = 'The capital of {{c1::France::country}} is {{c2::Paris::city}}.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'The capital of <span class="cloze-deletion cloze-1" data-cloze=1>France</span> is <span class="cloze-deletion cloze-2" data-cloze=2>Paris</span>.'
			);
		});

		it('should handle nested cloze deletions', () => {
			const text = 'The {{c1::capital of {{c2::France}} is {{c3::Paris}}}}.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'The <span class="cloze-deletion cloze-1" data-cloze=1>capital of <span class="cloze-deletion cloze-2" data-cloze=2>France</span> is <span class="cloze-deletion cloze-3" data-cloze=3>Paris</span></span>.'
			);
		});

		it('should handle deeply nested cloze deletions', () => {
			const text = 'The {{c1::{{c2::best}} example of {{c3::nested {{c4::cloze}} deletions}}}}.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'The <span class="cloze-deletion cloze-1" data-cloze=1><span class="cloze-deletion cloze-2" data-cloze=2>best</span> example of <span class="cloze-deletion cloze-3" data-cloze=3>nested <span class="cloze-deletion cloze-4" data-cloze=4>cloze</span> deletions</span></span>.'
			);
		});

		it('should handle empty cloze content', () => {
			const text = 'This has an {{c1::}} empty cloze.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'This has an <span class="cloze-deletion cloze-1" data-cloze=1></span> empty cloze.'
			);
		});

		it('should handle arbitrary number of clozes', () => {
			const text = 'Simple {{c11::cloze}}.';
			
			const highlighted = ClozeHighlighter.highlightClozes(text);
			
			expect(highlighted).toBe(
				'Simple <span class="cloze-deletion cloze-1" data-cloze=11>cloze</span>.'
			);
		});
	});
});
