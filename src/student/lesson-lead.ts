export function firstLeadFromBlocks(
  blocks: Array<{ block_type: string; content: { html?: string; text?: string } }>
): string | null {
  for (const block of blocks) {
    if (block.block_type === 'rich_text' && block.content.html) {
      const text = block.content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    if (block.block_type === 'heading' && block.content.text?.trim()) {
      return block.content.text.trim();
    }
  }
  return null;
}
